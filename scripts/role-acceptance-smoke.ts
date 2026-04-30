import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, type ChildProcess } from "child_process";
import { hash } from "bcryptjs";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

import { acceptRouting } from "@/features/dealer/actions";
import { registerPayment } from "@/features/finance/actions";

config({ path: ".env.local" });

const prisma = new PrismaClient();
const baseUrl = process.env.ROLE_ACCEPTANCE_BASE_URL ?? "http://localhost:3300";
const password = "RoleAccept123";

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
    await sleep(200);
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
  const port = 27000 + Math.floor(Math.random() * 1000);
  const userDataDir = await mkdtemp(join(tmpdir(), "goods-role-accept-"));
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
  const target = new URL(url);
  const targetHref = `${target.origin}${target.pathname}${target.search}`;
  await waitFor(async () => {
    const ready = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
      expression: `
        (() => {
          const ready = document.readyState === "complete" || document.readyState === "interactive";
          if (!ready) return "";
          const href = location.href;
          if (href.startsWith(${JSON.stringify(targetHref)})) return href;
          if (location.pathname === "/forbidden" || location.pathname === "/login") return href;
          return "";
        })()
      `,
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
  await client.send("Runtime.evaluate", {
    expression: `
      (() => {
        const phone = document.querySelector("#phone");
        const password = document.querySelector("#password");
        if (phone) phone.value = "";
        if (password) password.value = "";
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  await client.send("Runtime.evaluate", { expression: "document.querySelector('#phone').focus()", awaitPromise: true, returnByValue: true });
  await client.send("Input.insertText", { text: phone });
  await client.send("Runtime.evaluate", { expression: "document.querySelector('#password').focus()", awaitPromise: true, returnByValue: true });
  await client.send("Input.insertText", { text: password });
  await client.send("Runtime.evaluate", { expression: "document.querySelector('button[type=\"submit\"]').click()", awaitPromise: true, returnByValue: true });
  await waitFor(async () => {
    const result = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
      expression: "location.pathname",
      returnByValue: true,
    });
    return result.result?.value !== "/login" ? result.result?.value : null;
  }, 30000, `login ${phone}`);
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
    assert(text.includes(item), `${label} should include ${item}; sample=${text.slice(0, 600)}`);
  }
  for (const item of excludes) {
    assert(!text.includes(item), `${label} should not include ${item}; sample=${text.slice(0, 600)}`);
  }
}

async function clickButton(client: CdpClient, label: string, scopeText?: string) {
  const clicked = await waitFor(async () => {
    const result = await client.send<{ result?: { value?: { clicked: boolean; reason?: string; sample?: string } } }>("Runtime.evaluate", {
      expression: `
        (() => {
          const label = ${JSON.stringify(label)};
          const scopeText = ${JSON.stringify(scopeText ?? "")};
          const buttons = Array.from(document.querySelectorAll("button"));
          const button = buttons.find((candidate) => {
            const text = candidate.innerText || candidate.textContent || "";
            if (!text.includes(label)) return false;
            if (!scopeText) return true;
            let node = candidate;
            for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
              if ((node.innerText || "").includes(scopeText)) return true;
            }
            return false;
          });
          if (!button) return { clicked: false, reason: "missing", sample: (document.body?.innerText || "").slice(0, 800) };
          if (button.disabled) return { clicked: false, reason: "disabled", sample: button.innerText };
          button.click();
          return { clicked: true };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value?.clicked ? result.result.value : null;
  }, 15000, `button ${label}`);
  assert(clicked.clicked, `Failed to click ${label}`);
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

let orderCounter = 0;

function nextOrderNo(prefix: string) {
  orderCounter += 1;
  return `${prefix}${Date.now().toString(36).toUpperCase()}${orderCounter.toString().padStart(2, "0")}`;
}

async function createOrder(input: {
  orderNo: string;
  customerId: string;
  addressId: string;
  salesPersonId?: string;
  productId: string;
  productName: string;
  sku: string;
  status: "PENDING_PAYMENT" | "PAID" | "CONFIRMED" | "COMPLETED";
  routingType?: "WAREHOUSE" | "DEALER";
  payableAmount: string;
  paidAmount?: string;
  createdAt?: Date;
}) {
  return prisma.order.create({
    data: {
      orderNo: input.orderNo,
      customerId: input.customerId,
      addressId: input.addressId,
      salesPersonId: input.salesPersonId,
      type: "RETAIL",
      status: input.status,
      source: "MANUAL",
      routingType: input.routingType ?? "WAREHOUSE",
      totalAmount: input.payableAmount,
      discountAmount: "0.00",
      payableAmount: input.payableAmount,
      paidAmount: input.paidAmount ?? "0.00",
      payMethod: Number(input.paidAmount ?? 0) > 0 ? "TRANSFER" : undefined,
      createdAt: input.createdAt,
      items: {
        create: {
          productId: input.productId,
          productName: input.productName,
          sku: input.sku,
          unitPrice: input.payableAmount,
          quantity: 1,
          totalAmount: input.payableAmount,
        },
      },
    },
    select: { id: true, orderNo: true, payableAmount: true, paidAmount: true },
  });
}

async function ensureTestData() {
  const runId = `ROLE-${Date.now().toString(36).toUpperCase()}`;
  const passwordHash = await hash(password, 12);
  const users = {
    sales: await prisma.user.upsert({
      where: { phone: "13900009782" },
      update: { name: `${runId}-业务员`, password: passwordHash, role: "SALESPERSON", isActive: true },
      create: { name: `${runId}-业务员`, phone: "13900009782", password: passwordHash, role: "SALESPERSON", isActive: true },
      select: { id: true, name: true, phone: true },
    }),
    finance: await prisma.user.upsert({
      where: { phone: "13900009783" },
      update: { name: `${runId}-财务`, password: passwordHash, role: "FINANCE", isActive: true },
      create: { name: `${runId}-财务`, phone: "13900009783", password: passwordHash, role: "FINANCE", isActive: true },
      select: { id: true, name: true, phone: true },
    }),
    warehouse: await prisma.user.upsert({
      where: { phone: "13900009784" },
      update: { name: `${runId}-仓管`, password: passwordHash, role: "WAREHOUSE", isActive: true },
      create: { name: `${runId}-仓管`, phone: "13900009784", password: passwordHash, role: "WAREHOUSE", isActive: true },
      select: { id: true, name: true, phone: true },
    }),
  };

  const category = await prisma.category.create({ data: { name: `${runId}-签收分类`, sortOrder: 100 } });
  const brand = await prisma.brand.upsert({
    where: { name: "角色模拟签收品牌" },
    update: { description: "角色模拟签收 smoke" },
    create: { name: "角色模拟签收品牌", description: "角色模拟签收 smoke" },
  });
  const product = await prisma.product.upsert({
    where: { sku: "ROLE-ACCEPT-001" },
    update: {
      name: `${runId} 剑兰春签收装`,
      categoryId: category.id,
      brandId: brand.id,
      unit: "箱",
      spec: "500ml*6",
      costPrice: "42.00",
      wholesalePrice: "68.00",
      retailPrice: "128.00",
      memberPrice: "118.00",
      stock: 4,
      safeStock: 10,
      status: "ACTIVE",
    },
    create: {
      sku: "ROLE-ACCEPT-001",
      name: `${runId} 剑兰春签收装`,
      categoryId: category.id,
      brandId: brand.id,
      unit: "箱",
      spec: "500ml*6",
      costPrice: "42.00",
      wholesalePrice: "68.00",
      retailPrice: "128.00",
      memberPrice: "118.00",
      stock: 4,
      safeStock: 10,
      status: "ACTIVE",
    },
    select: { id: true, name: true, sku: true },
  });

  const businessCustomer = await prisma.customer.upsert({
    where: { phone: "13900009785" },
    update: { name: `${runId}-业务签收客户`, password: passwordHash, type: "CONSUMER", isVerified: true, salesPersonId: users.sales.id },
    create: { name: `${runId}-业务签收客户`, phone: "13900009785", password: passwordHash, type: "CONSUMER", isVerified: true, salesPersonId: users.sales.id },
    select: { id: true, name: true, phone: true },
  });
  const businessAddress = await ensureAddress(businessCustomer.id, businessCustomer.name, businessCustomer.phone, `${runId} 业务签收地址`);

  const dealerCustomer = await prisma.customer.upsert({
    where: { phone: "13900009786" },
    update: { name: `${runId}-签收经销商`, password: passwordHash, type: "DEALER", isVerified: true, salesPersonId: users.sales.id },
    create: { name: `${runId}-签收经销商`, phone: "13900009786", password: passwordHash, type: "DEALER", isVerified: true, salesPersonId: users.sales.id },
    select: { id: true, name: true, phone: true },
  });
  const dealerAddress = await ensureAddress(dealerCustomer.id, dealerCustomer.name, dealerCustomer.phone, `${runId} 经销商配送地址`);
  const dealer = await prisma.dealer.upsert({
    where: { customerId: dealerCustomer.id },
    update: { shopName: `${runId}-签收门店`, zone: "雨湖区", serviceRadius: 5000, isAccepting: true },
    create: {
      customerId: dealerCustomer.id,
      shopName: `${runId}-签收门店`,
      businessLicense: `${runId}-LICENSE`,
      latitude: "27.856000",
      longitude: "112.912000",
      serviceRadius: 5000,
      zone: "雨湖区",
      isAccepting: true,
    },
    select: { id: true, shopName: true },
  });
  await prisma.dealerStock.upsert({
    where: { dealerId_productId: { dealerId: dealer.id, productId: product.id } },
    update: { stock: 7, reportedAt: new Date() },
    create: { dealerId: dealer.id, productId: product.id, stock: 7 },
  });

  const businessOrder = await createOrder({
    orderNo: nextOrderNo("RABIZ"),
    customerId: businessCustomer.id,
    addressId: businessAddress.id,
    salesPersonId: users.sales.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    status: "COMPLETED",
    payableAmount: "12000.00",
    paidAmount: "12000.00",
  });
  await prisma.payment.create({
    data: {
      orderId: businessOrder.id,
      customerId: businessCustomer.id,
      type: "RECEIVE",
      amount: "12000.00",
      method: "TRANSFER",
      status: "COMPLETED",
      paidAt: new Date(),
      operatorId: users.finance.id,
      transactionId: `${runId}-BIZ`,
    },
  });

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 45);
  const financeOrder = await createOrder({
    orderNo: nextOrderNo("RAFIN"),
    customerId: businessCustomer.id,
    addressId: businessAddress.id,
    salesPersonId: users.sales.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    status: "PENDING_PAYMENT",
    payableAmount: "268.00",
    paidAmount: "68.00",
    createdAt: oldDate,
  });
  await prisma.payment.create({
    data: {
      orderId: financeOrder.id,
      customerId: businessCustomer.id,
      type: "RECEIVE",
      amount: "68.00",
      method: "TRANSFER",
      status: "COMPLETED",
      paidAt: oldDate,
      operatorId: users.finance.id,
      transactionId: `${runId}-PARTIAL`,
    },
  });

  const warehouseOrder = await createOrder({
    orderNo: nextOrderNo("RAWH"),
    customerId: businessCustomer.id,
    addressId: businessAddress.id,
    salesPersonId: users.sales.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    status: "PAID",
    routingType: "WAREHOUSE",
    payableAmount: "188.00",
    paidAmount: "188.00",
  });
  await prisma.delivery.upsert({
    where: { orderId: warehouseOrder.id },
    update: { status: "PENDING", method: "总仓配送", trackingNo: `${runId}-TRACK` },
    create: { orderId: warehouseOrder.id, status: "PENDING", method: "总仓配送", trackingNo: `${runId}-TRACK` },
  });
  await prisma.stockRecord.create({
    data: {
      productId: product.id,
      type: "IN",
      quantity: 2,
      beforeStock: 2,
      afterStock: 4,
      operatorId: users.warehouse.id,
      remark: `${runId} 角色签收入库`,
    },
  });

  const dealerPendingOrder = await createOrder({
    orderNo: nextOrderNo("RADLR"),
    customerId: businessCustomer.id,
    addressId: businessAddress.id,
    salesPersonId: users.sales.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    status: "PAID",
    routingType: "DEALER",
    payableAmount: "328.00",
    paidAmount: "328.00",
  });
  const pendingRouting = await prisma.orderRouting.create({
    data: { orderId: dealerPendingOrder.id, dealerId: dealer.id, status: "PENDING", distance: "1.20" },
    select: { id: true },
  });

  const dealerCompletedOrder = await createOrder({
    orderNo: nextOrderNo("RASET"),
    customerId: dealerCustomer.id,
    addressId: dealerAddress.id,
    salesPersonId: users.sales.id,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    status: "COMPLETED",
    routingType: "DEALER",
    payableAmount: "488.00",
    paidAmount: "488.00",
  });
  await prisma.orderRouting.create({
    data: { orderId: dealerCompletedOrder.id, dealerId: dealer.id, status: "ACCEPTED", distance: "0.80", respondedAt: new Date() },
  });

  await prisma.channelConflict.create({
    data: {
      type: "COMPLAINT",
      status: "OPEN",
      orderId: businessOrder.id,
      dealerId: dealer.id,
      customerId: businessCustomer.id,
      ownerId: users.sales.id,
      summary: `${runId} 业务模拟渠道冲突`,
      detail: {
        text: "模拟客户反馈同区域报价不一致，业务员需要跟进处理。",
        source: "ROLE_ACCEPTANCE",
        events: [{ action: "CREATE", at: new Date().toISOString(), note: "角色模拟签收造数" }],
      },
    },
  });

  return {
    runId,
    users,
    product,
    businessCustomer,
    dealerCustomer,
    dealer,
    businessOrder,
    financeOrder,
    warehouseOrder,
    dealerPendingOrder,
    dealerCompletedOrder,
    pendingRouting,
  };
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
    await login(client, data.users.sales.phone);
    let state = await bodyState(client, `/dashboard/customers/${data.businessCustomer.id}`, data.businessCustomer.name);
    assertText(state.text, [data.businessCustomer.name, data.businessCustomer.phone, "基础档案"], [], "business customer acceptance");
    state = await bodyState(client, `/dashboard/orders/${data.businessOrder.id}`, data.businessOrder.orderNo);
    assertText(state.text, [data.businessOrder.orderNo, data.product.name, "支付记录"], [], "business order acceptance");
    state = await bodyState(client, "/dashboard/sales", "客户销售额排名");
    assertText(state.text, [data.users.sales.name, "销售额", "订单数", "TOP10 畅销产品"], [], "business sales report acceptance");
    state = await bodyState(client, "/dashboard/channel-conflicts", `${data.runId} 业务模拟渠道冲突`);
    assertText(state.text, [`${data.runId} 业务模拟渠道冲突`, data.businessCustomer.name], [], "business channel conflict acceptance");
    results.push("PASS business/sales simulated sign-off");

    await login(client, data.users.finance.phone);
    state = await bodyState(client, "/dashboard/finance", "近 30 天收入趋势");
    assertText(state.text, ["应收总额", "本月收入", "毛利润"], [], "finance overview acceptance");
    state = await bodyState(client, "/dashboard/finance/receivable", data.businessCustomer.name);
    assertText(state.text, [data.businessCustomer.name, data.businessCustomer.phone, "总欠款"], [], "finance receivable acceptance");
    state = await bodyState(client, `/dashboard/finance/payments?customerId=${data.businessCustomer.id}`, data.financeOrder.orderNo);
    assertText(state.text, [data.financeOrder.orderNo, "登记收款", "确认收款"], [], "finance payment register acceptance");
    const paidBefore = Number(data.financeOrder.paidAmount);
    process.env.AI_TOOL_TEST_SESSION_USER = JSON.stringify({
      id: data.users.finance.id,
      name: data.users.finance.name,
      phone: data.users.finance.phone,
      role: "FINANCE",
      type: "STAFF",
    });
    const paymentResult = await registerPayment({
      customerId: data.businessCustomer.id,
      method: "TRANSFER",
      allocations: [{ orderId: data.financeOrder.id, amount: 20 }],
    });
    delete process.env.AI_TOOL_TEST_SESSION_USER;
    assert(paymentResult.success, paymentResult.success ? "收款已登记" : paymentResult.error.message);
    await waitFor(async () => {
      const order = await prisma.order.findUnique({ where: { id: data.financeOrder.id }, select: { paidAmount: true } });
      return order && Number(order.paidAmount) >= paidBefore + 20 ? order : null;
    }, 30000, "finance payment database update");
    results.push("PASS finance simulated sign-off");

    await login(client, data.users.warehouse.phone);
    state = await bodyState(client, "/dashboard/warehouse", data.product.name);
    assertText(state.text, ["仓储作业", "库存预警", data.product.sku, `${data.runId} 角色签收入库`], [], "warehouse overview acceptance");
    state = await bodyState(client, `/dashboard/delivery?q=${data.warehouseOrder.orderNo}`, data.warehouseOrder.orderNo);
    assertText(state.text, [data.warehouseOrder.orderNo, data.businessCustomer.name, `${data.runId}-TRACK`], [], "warehouse delivery acceptance");
    const checkStartedAt = new Date();
    await bodyState(client, "/dashboard/warehouse", "新建盘点");
    await clickButton(client, "新建盘点");
    const check = await waitFor(async () => {
      return prisma.stockCheck.findFirst({
        where: { operatorId: data.users.warehouse.id, createdAt: { gte: checkStartedAt } },
        orderBy: { createdAt: "desc" },
        select: { id: true, checkNo: true },
      });
    }, 30000, "warehouse stock check creation");
    state = await bodyState(client, `/dashboard/warehouse/checks/${check.id}`, check.checkNo);
    assertText(state.text, [check.checkNo, "盘点"], [], "warehouse stock check detail acceptance");
    results.push("PASS warehouse simulated sign-off");

    await login(client, data.dealerCustomer.phone);
    state = await bodyState(client, "/dealer/incoming", data.dealerPendingOrder.orderNo);
    assertText(state.text, [data.dealer.shopName, data.dealerPendingOrder.orderNo, data.product.name, "接单"], [], "dealer incoming acceptance");
    process.env.AI_TOOL_TEST_SESSION_USER = JSON.stringify({
      id: data.dealerCustomer.id,
      name: data.dealerCustomer.name,
      phone: data.dealerCustomer.phone,
      role: "DEALER",
      type: "CUSTOMER",
    });
    const acceptResult = await acceptRouting(data.pendingRouting.id);
    delete process.env.AI_TOOL_TEST_SESSION_USER;
    assert(acceptResult.success, acceptResult.success ? "已接单" : acceptResult.error.message);
    await waitFor(async () => {
      const routing = await prisma.orderRouting.findUnique({ where: { id: data.pendingRouting.id }, select: { status: true } });
      return routing?.status === "ACCEPTED" ? routing : null;
    }, 30000, "dealer accept routing");
    state = await bodyState(client, "/dealer/my-orders", data.dealerPendingOrder.orderNo);
    assertText(state.text, [data.dealerPendingOrder.orderNo, data.product.name], [], "dealer my orders acceptance");
    state = await bodyState(client, "/dealer/settlement", data.dealerCompletedOrder.orderNo);
    assertText(state.text, [data.dealerCompletedOrder.orderNo, "结算金额"], [], "dealer settlement acceptance");
    state = await bodyState(client, "/dealer/stock", data.product.name);
    assertText(state.text, [data.product.name, data.product.sku, "库存上报"], [], "dealer stock acceptance");
    results.push("PASS dealer simulated sign-off");

    const meaningfulErrors = client.consoleErrors.filter((item) => !item.includes("favicon"));
    assert(meaningfulErrors.length === 0, `Browser console/runtime errors found: ${meaningfulErrors.join(" | ")}`);

    console.log(`Role acceptance smoke passed: runId=${data.runId}`);
    for (const result of results) console.log(result);
  } finally {
    await stopBrowser(launched.child, launched.userDataDir, launched.client);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
