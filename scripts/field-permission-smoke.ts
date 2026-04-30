import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, type ChildProcess } from "child_process";
import { hash } from "bcryptjs";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });

const prisma = new PrismaClient();
const baseUrl = process.env.FIELD_PERMISSION_BASE_URL ?? "http://localhost:3300";
const password = "FieldPerm123";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertTestDatabase() {
  assert(/[?&]schema=goods_sell_test(?:&|$)/.test(process.env.DATABASE_URL ?? ""), "DATABASE_URL must point to schema=goods_sell_test");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, label: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(150);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  readonly consoleErrors: string[] = [];

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) {
          waiter.reject(new Error(message.error.message ?? "CDP command failed"));
        } else {
          waiter.resolve(message.result);
        }
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        this.consoleErrors.push(JSON.stringify(message.params).slice(0, 500));
      }
      if (message.method === "Log.entryAdded") {
        const entry = (message.params as { entry?: { level?: string; text?: string } })?.entry;
        if (entry?.level === "error") this.consoleErrors.push(entry.text ?? "Log.entryAdded error");
      }
    });
  }

  static async connect(webSocketDebuggerUrl: string) {
    assert(globalThis.WebSocket, "Current Node runtime does not expose WebSocket");
    const ws = new globalThis.WebSocket(webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("Failed to connect to browser CDP")), { once: true });
    });
    return new CdpClient(ws);
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

function chromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function launchBrowser() {
  const executablePath = chromePath();
  assert(executablePath, "No Chrome or Edge executable found");
  const port = 26000 + Math.floor(Math.random() * 1000);
  const userDataDir = await mkdtemp(join(tmpdir(), "goods-field-perm-"));
  const child = spawn(
    executablePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--window-size=1366,768",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const targetInfo = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) });
      if (!response.ok) return null;
      const pages = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
      return pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl) ?? null;
    } catch {
      return null;
    }
  }, 15000, "browser CDP");
  assert(targetInfo.webSocketDebuggerUrl, "Browser did not expose page CDP websocket");
  const client = await CdpClient.connect(targetInfo.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  return { child, userDataDir, client };
}

async function stopBrowser(child: ChildProcess, userDataDir: string, client?: CdpClient) {
  client?.close();
  child.kill();
  await sleep(600);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

async function navigate(client: CdpClient, url: string) {
  await client.send("Page.navigate", { url });
  await waitFor(async () => {
    const ready = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
      expression: "document.readyState === 'complete' || document.readyState === 'interactive' ? location.href : ''",
      returnByValue: true,
    });
    return ready.result?.value;
  }, 10000, `document ready ${url}`);
}

async function login(client: CdpClient, phone: string) {
  await navigate(client, `${baseUrl}/login`);
  await waitFor(async () => {
    const result = await client.send<{ result?: { value?: boolean } }>("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('#phone') && document.querySelector('#password') && document.querySelector('button[type=\"submit\"]'))",
      returnByValue: true,
    });
    return result.result?.value;
  }, 15000, "login form");
  await client.send("Runtime.evaluate", { expression: "document.querySelector('#phone').focus()", awaitPromise: true, returnByValue: true });
  await client.send("Input.insertText", { text: phone });
  await client.send("Runtime.evaluate", { expression: "document.querySelector('#password').focus()", awaitPromise: true, returnByValue: true });
  await client.send("Input.insertText", { text: password });
  await client.send("Runtime.evaluate", { expression: "document.querySelector('button[type=\"submit\"]').click()", awaitPromise: true, returnByValue: true });
  try {
    await waitFor(async () => {
      const result = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
        expression: "location.pathname",
        returnByValue: true,
      });
      return result.result?.value !== "/login" ? result.result?.value : null;
    }, 30000, `login ${phone}`);
  } catch (error) {
    const state = await client.send<{ result?: { value?: { url: string; text: string; phone: string; passwordLength: number } } }>("Runtime.evaluate", {
      expression: `
        (() => ({
          url: location.href,
          text: document.body?.innerText || "",
          phone: document.querySelector("#phone")?.value || "",
          passwordLength: document.querySelector("#password")?.value?.length || 0
        }))()
      `,
      returnByValue: true,
    });
    const value = state.result?.value;
    throw new Error(`${error instanceof Error ? error.message : String(error)}; url=${value?.url}; phone=${value?.phone}; passwordLength=${value?.passwordLength}; text=${value?.text.slice(0, 260)}`);
  }
}

async function bodyState(client: CdpClient, route: string, readyText?: string) {
  await navigate(client, `${baseUrl}${route}`);
  const value = await waitFor(async () => {
    const result = await client.send<{ result?: { value?: { url: string; text: string; appError: boolean; h1: string | null } } }>("Runtime.evaluate", {
      expression: `
        (() => {
          const text = document.body?.innerText || "";
          return {
            url: location.href,
            text,
            h1: document.querySelector("h1")?.innerText || null,
            appError: text.includes("Application error") || text.includes("Unhandled Runtime Error")
          };
        })()
      `,
      returnByValue: true,
    });
    const current = result.result?.value;
    if (!current) return null;
    if (current.appError || current.url.includes("/forbidden") || current.text.includes("This page could not be found")) return current;
    if (!readyText || current.text.includes(readyText)) return current;
    return null;
  }, 15000, `page content ${route}`);
  assert(!value.appError, `${route} has runtime error`);
  return value;
}

function assertText(text: string, includes: string[], excludes: string[], label: string) {
  for (const item of includes) {
    assert(text.includes(item), `${label} should include ${item}; sample=${text.slice(0, 500)}`);
  }
  for (const item of excludes) {
    assert(!text.includes(item), `${label} should not include ${item}; sample=${text.slice(0, 500)}`);
  }
}

async function ensureAddress(customerId: string, name: string, phone: string, detail: string) {
  const existing = await prisma.address.findFirst({ where: { customerId }, orderBy: { updatedAt: "desc" } });
  if (existing) {
    return prisma.address.update({
      where: { id: existing.id },
      data: { name, phone, province: "湖南省", city: "湘潭市", district: "雨湖区", detail, isDefault: true },
    });
  }
  return prisma.address.create({
    data: { customerId, name, phone, province: "湖南省", city: "湘潭市", district: "雨湖区", detail, isDefault: true },
  });
}

async function createOrder(input: { orderNo: string; customerId: string; addressId: string; salesPersonId: string; productId: string; productName: string; sku: string }) {
  return prisma.order.create({
    data: {
      orderNo: input.orderNo,
      customerId: input.customerId,
      addressId: input.addressId,
      salesPersonId: input.salesPersonId,
      type: "RETAIL",
      status: "PAID",
      source: "MANUAL",
      routingType: "WAREHOUSE",
      totalAmount: "88.00",
      discountAmount: "0.00",
      payableAmount: "88.00",
      paidAmount: "88.00",
      payMethod: "WECHAT",
      items: {
        create: {
          productId: input.productId,
          productName: input.productName,
          sku: input.sku,
          unitPrice: "88.00",
          quantity: 1,
          totalAmount: "88.00",
        },
      },
      payments: {
        create: {
          customerId: input.customerId,
          type: "RECEIVE",
          amount: "88.00",
          method: "WECHAT",
          status: "COMPLETED",
          paidAt: new Date(),
          transactionId: `FIELD-${input.orderNo}`,
        },
      },
    },
    select: { id: true, orderNo: true },
  });
}

async function ensureTestData() {
  const runId = `FIELD-${Date.now().toString(36).toUpperCase()}`;
  const passwordHash = await hash(password, 12);
  const users = {
    admin: await prisma.user.upsert({
      where: { phone: "13900009891" },
      update: { name: "字段权限测试管理员", password: passwordHash, role: "ADMIN", isActive: true },
      create: { name: "字段权限测试管理员", phone: "13900009891", password: passwordHash, role: "ADMIN", isActive: true },
      select: { id: true, phone: true },
    }),
    salespersonA: await prisma.user.upsert({
      where: { phone: "13900009892" },
      update: { name: "字段权限测试销售A", password: passwordHash, role: "SALESPERSON", isActive: true },
      create: { name: "字段权限测试销售A", phone: "13900009892", password: passwordHash, role: "SALESPERSON", isActive: true },
      select: { id: true, phone: true },
    }),
    salespersonB: await prisma.user.upsert({
      where: { phone: "13900009893" },
      update: { name: "字段权限测试销售B", password: passwordHash, role: "SALESPERSON", isActive: true },
      create: { name: "字段权限测试销售B", phone: "13900009893", password: passwordHash, role: "SALESPERSON", isActive: true },
      select: { id: true, phone: true },
    }),
    warehouse: await prisma.user.upsert({
      where: { phone: "13900009894" },
      update: { name: "字段权限测试仓管", password: passwordHash, role: "WAREHOUSE", isActive: true },
      create: { name: "字段权限测试仓管", phone: "13900009894", password: passwordHash, role: "WAREHOUSE", isActive: true },
      select: { id: true, phone: true },
    }),
    finance: await prisma.user.upsert({
      where: { phone: "13900009895" },
      update: { name: "字段权限测试财务", password: passwordHash, role: "FINANCE", isActive: true },
      create: { name: "字段权限测试财务", phone: "13900009895", password: passwordHash, role: "FINANCE", isActive: true },
      select: { id: true, phone: true },
    }),
  };

  const category = await prisma.category.create({ data: { name: `${runId}-字段权限分类`, sortOrder: 99 } });
  const brand = await prisma.brand.upsert({
    where: { name: "字段权限测试品牌" },
    update: { description: "字段权限 smoke" },
    create: { name: "字段权限测试品牌", description: "字段权限 smoke" },
  });
  const product = await prisma.product.upsert({
    where: { sku: "FIELD-PERM-001" },
    update: {
      name: "字段权限测试剑兰春",
      categoryId: category.id,
      brandId: brand.id,
      unit: "箱",
      spec: "500ml*6",
      costPrice: "31.00",
      wholesalePrice: "47.00",
      retailPrice: "88.00",
      memberPrice: "80.00",
      stock: 66,
      safeStock: 9,
      status: "ACTIVE",
    },
    create: {
      sku: "FIELD-PERM-001",
      name: "字段权限测试剑兰春",
      categoryId: category.id,
      brandId: brand.id,
      unit: "箱",
      spec: "500ml*6",
      costPrice: "31.00",
      wholesalePrice: "47.00",
      retailPrice: "88.00",
      memberPrice: "80.00",
      stock: 66,
      safeStock: 9,
      status: "ACTIVE",
    },
    select: { id: true, name: true, sku: true },
  });

  async function upsertCustomer(phone: string, name: string, salesPersonId: string, type: "CONSUMER" | "DEALER" = "CONSUMER") {
    return prisma.customer.upsert({
      where: { phone },
      update: { name, password: passwordHash, type, isVerified: true, salesPersonId },
      create: { name, phone, password: passwordHash, type, isVerified: true, salesPersonId },
      select: { id: true, name: true, phone: true },
    });
  }

  const ownedCustomer = await upsertCustomer("13900009896", "字段权限销售A客户", users.salespersonA.id);
  const otherCustomer = await upsertCustomer("13900009897", "字段权限销售B客户", users.salespersonB.id);
  const ownedAddress = await ensureAddress(ownedCustomer.id, ownedCustomer.name, ownedCustomer.phone, `${runId} 销售A客户地址`);
  const otherAddress = await ensureAddress(otherCustomer.id, otherCustomer.name, otherCustomer.phone, `${runId} 销售B客户地址`);

  const ownedOrder = await createOrder({
    orderNo: `FP${Date.now().toString(36).toUpperCase()}A`,
    customerId: ownedCustomer.id,
    addressId: ownedAddress.id,
    salesPersonId: users.salespersonA.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
  });
  const otherOrder = await createOrder({
    orderNo: `FP${Date.now().toString(36).toUpperCase()}B`,
    customerId: otherCustomer.id,
    addressId: otherAddress.id,
    salesPersonId: users.salespersonB.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
  });

  const ownedDealerCustomer = await upsertCustomer("13900009898", "字段权限销售A经销商", users.salespersonA.id, "DEALER");
  const otherDealerCustomer = await upsertCustomer("13900009899", "字段权限销售B经销商", users.salespersonB.id, "DEALER");
  const ownedDealer = await prisma.dealer.upsert({
    where: { customerId: ownedDealerCustomer.id },
    update: { shopName: "字段权限销售A门店", zone: "雨湖区", serviceRadius: 3000, isAccepting: true },
    create: {
      customerId: ownedDealerCustomer.id,
      shopName: "字段权限销售A门店",
      businessLicense: "FIELD-A",
      latitude: "27.856000",
      longitude: "112.912000",
      serviceRadius: 3000,
      zone: "雨湖区",
      isAccepting: true,
    },
    select: { id: true, shopName: true },
  });
  const otherDealer = await prisma.dealer.upsert({
    where: { customerId: otherDealerCustomer.id },
    update: { shopName: "字段权限销售B门店", zone: "岳塘区", serviceRadius: 3000, isAccepting: true },
    create: {
      customerId: otherDealerCustomer.id,
      shopName: "字段权限销售B门店",
      businessLicense: "FIELD-B",
      latitude: "27.856000",
      longitude: "112.912000",
      serviceRadius: 3000,
      zone: "岳塘区",
      isAccepting: true,
    },
    select: { id: true, shopName: true },
  });

  await prisma.dealerPolicy.upsert({
    where: { dealerId: ownedDealer.id },
    update: { minOrderAmount: "100.00", priceLevel: "WHOLESALE", allowCrossZone: false, allowReject: true, priority: 1 },
    create: { dealerId: ownedDealer.id, minOrderAmount: "100.00", priceLevel: "WHOLESALE", allowCrossZone: false, allowReject: true, priority: 1 },
  });
  await prisma.dealerPolicy.upsert({
    where: { dealerId: otherDealer.id },
    update: { minOrderAmount: "200.00", priceLevel: "VIP", allowCrossZone: false, allowReject: true, priority: 2 },
    create: { dealerId: otherDealer.id, minOrderAmount: "200.00", priceLevel: "VIP", allowCrossZone: false, allowReject: true, priority: 2 },
  });

  return { runId, users, product, ownedCustomer, otherCustomer, ownedOrder, otherOrder, ownedDealer, otherDealer };
}

async function main() {
  assertTestDatabase();
  const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5000) });
  assert(response.ok, `Test server is not reachable: ${baseUrl}`);
  const data = await ensureTestData();
  const launched = await launchBrowser();
  const { client } = launched;
  const results: string[] = [];
  try {
    await login(client, data.users.admin.phone);
    let state = await bodyState(client, `/dashboard/products/${data.product.id}`, data.product.name);
    assertText(state.text, ["进价", "批发价", "零售价", data.product.sku], [], "admin product detail");
    results.push("PASS admin product detail price fields");

    await login(client, data.users.finance.phone);
    state = await bodyState(client, `/dashboard/products/${data.product.id}`, data.product.name);
    assertText(state.text, ["进价", "批发价", "零售价"], [], "finance product detail");
    results.push("PASS finance product detail price fields");

    await login(client, data.users.salespersonA.phone);
    state = await bodyState(client, `/dashboard/products/${data.product.id}`, data.product.name);
    assertText(state.text, ["批发价", "零售价"], ["进价"], "sales product detail");
    results.push("PASS salesperson product detail price fields");

    state = await bodyState(client, `/dashboard/customers/${data.ownedCustomer.id}`, data.ownedCustomer.name);
    assertText(state.text, [data.ownedCustomer.name, data.ownedCustomer.phone, "基础档案"], [], "sales owned customer");
    state = await bodyState(client, `/dashboard/customers/${data.otherCustomer.id}`);
    assertText(state.text, [], [data.otherCustomer.name, data.otherCustomer.phone], "sales unowned customer");
    results.push("PASS salesperson customer ownership boundary");

    state = await bodyState(client, `/dashboard/orders/${data.ownedOrder.id}`, data.ownedOrder.orderNo);
    assertText(state.text, [data.ownedOrder.orderNo, data.ownedCustomer.name, "支付记录"], [], "sales owned order");
    state = await bodyState(client, `/dashboard/orders/${data.otherOrder.id}`);
    assertText(state.text, [], [data.otherOrder.orderNo, data.otherCustomer.name], "sales unowned order");
    results.push("PASS salesperson order ownership boundary");

    state = await bodyState(client, `/dashboard/dealers/${data.ownedDealer.id}/policy`, data.ownedDealer.shopName);
    assertText(state.text, [data.ownedDealer.shopName, "经销商政策"], [], "sales owned dealer policy");
    state = await bodyState(client, `/dashboard/dealers/${data.otherDealer.id}/policy`);
    assertText(state.text, [], [data.otherDealer.shopName, "经销商政策"], "sales unowned dealer policy");
    results.push("PASS salesperson dealer ownership boundary");

    await login(client, data.users.warehouse.phone);
    state = await bodyState(client, `/dashboard/products/${data.product.id}`, data.product.name);
    assertText(state.text, ["零售价", "当前库存"], ["进价", "批发价"], "warehouse product detail");
    state = await bodyState(client, `/dashboard/products/${data.product.id}/edit`);
    assert(state.url.includes("/forbidden"), "warehouse product edit should redirect to /forbidden");
    state = await bodyState(client, "/dashboard/finance");
    assert(state.url.includes("/forbidden"), "warehouse finance should redirect to /forbidden");
    results.push("PASS warehouse field and route restrictions");

    assert(client.consoleErrors.length === 0, `Console errors detected: ${client.consoleErrors.slice(0, 3).join(" | ")}`);
  } finally {
    await stopBrowser(launched.child, launched.userDataDir, launched.client);
  }

  console.log(`Field permission smoke passed: runId=${data.runId}`);
  for (const result of results) console.log(result);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
