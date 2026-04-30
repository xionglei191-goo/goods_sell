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
const baseUrl = process.env.BROWSER_COMPAT_BASE_URL ?? "http://localhost:3300";
const password = "Compat123";

type BrowserTarget = {
  name: string;
  executablePath: string;
};

type Viewport = {
  name: string;
  width: number;
  height: number;
  mobile: boolean;
  deviceScaleFactor: number;
};

type PageCheck = {
  url: string;
  route: string;
  viewport: string;
  browser: string;
  appError: boolean;
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  title: string;
  h1: string | null;
  sample: string;
  consoleErrors: string[];
};

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
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(200);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

function browserTargets(): BrowserTarget[] {
  const candidates: BrowserTarget[] = [
    { name: "Chrome", executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    { name: "Edge", executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
  ];
  return candidates.filter((candidate) => existsSync(candidate.executablePath));
}

const viewports: Viewport[] = [
  { name: "desktop-1366", width: 1366, height: 768, mobile: false, deviceScaleFactor: 1 },
  { name: "mobile-390", width: 390, height: 844, mobile: true, deviceScaleFactor: 2 },
];

async function ensureAccounts() {
  const passwordHash = await hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { phone: "13900009991" },
    update: { name: "兼容性测试管理员", password: passwordHash, role: "ADMIN", isActive: true },
    create: { name: "兼容性测试管理员", phone: "13900009991", password: passwordHash, role: "ADMIN", isActive: true },
    select: { phone: true },
  });
  const warehouse = await prisma.user.upsert({
    where: { phone: "13900009993" },
    update: { name: "兼容性测试仓管", password: passwordHash, role: "WAREHOUSE", isActive: true },
    create: { name: "兼容性测试仓管", phone: "13900009993", password: passwordHash, role: "WAREHOUSE", isActive: true },
    select: { phone: true },
  });

  const dealerCustomer = await prisma.customer.upsert({
    where: { phone: "13900009992" },
    update: { name: "兼容性测试经销商", password: passwordHash, type: "DEALER", isVerified: true },
    create: {
      name: "兼容性测试经销商",
      phone: "13900009992",
      password: passwordHash,
      type: "DEALER",
      isVerified: true,
    },
    select: { id: true, phone: true },
  });

  await prisma.dealer.upsert({
    where: { customerId: dealerCustomer.id },
    update: { shopName: "兼容性测试门店", zone: "雨湖区", isAccepting: true },
    create: {
      customerId: dealerCustomer.id,
      shopName: "兼容性测试门店",
      businessLicense: "COMPAT-TEST",
      latitude: "27.856000",
      longitude: "112.912000",
      serviceRadius: 5000,
      zone: "雨湖区",
      isAccepting: true,
    },
  });

  const product = await prisma.product.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  assert(product, "At least one product is required for browser compatibility smoke");

  return { adminPhone: admin.phone, dealerPhone: dealerCustomer.phone, warehousePhone: warehouse.phone, productId: product.id };
}

async function findFreePort() {
  for (let port = 24000 + Math.floor(Math.random() * 1000); port < 26000; port += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(80) });
      if (!response.ok) return port;
    } catch {
      return port;
    }
  }
  throw new Error("No free debugging port found");
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private eventWaiters = new Map<string, Array<(params: unknown) => void>>();
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
      const waiters = message.method ? this.eventWaiters.get(message.method) : undefined;
      if (waiters?.length) {
        this.eventWaiters.set(message.method!, []);
        for (const resolve of waiters) resolve(message.params);
      }
    });
  }

  static async connect(webSocketDebuggerUrl: string) {
    const WebSocketCtor = globalThis.WebSocket;
    assert(WebSocketCtor, "Current Node runtime does not expose WebSocket");
    const ws = new WebSocketCtor(webSocketDebuggerUrl);
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

  waitForEvent(method: string, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const waiters = this.eventWaiters.get(method) ?? [];
      waiters.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      this.eventWaiters.set(method, waiters);
    });
  }

  close() {
    this.ws.close();
  }
}

async function launchBrowser(target: BrowserTarget, viewport: Viewport) {
  const port = await findFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), `goods-compat-${target.name.toLowerCase()}-`));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ];
  const child = spawn(target.executablePath, args, { stdio: "ignore" });
  const targetInfo = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(500) });
      if (!response.ok) return null;
      const pages = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
      return pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl) ?? null;
    } catch {
      return null;
    }
  }, 15000, `${target.name} CDP`);
  assert(targetInfo.webSocketDebuggerUrl, `${target.name} did not expose page CDP websocket`);
  const client = await CdpClient.connect(targetInfo.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: viewport.mobile,
  });
  if (viewport.mobile) {
    await client.send("Emulation.setUserAgentOverride", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.49",
    });
  }
  return { child, userDataDir, client };
}

async function stopBrowser(child: ChildProcess, userDataDir: string, client?: CdpClient) {
  client?.close();
  child.kill();
  await sleep(800);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

async function navigate(client: CdpClient, url: string) {
  await client.send("Page.navigate", { url });
  await waitFor(
    async () => {
      const ready = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
        expression: "document.readyState === 'complete' || document.readyState === 'interactive' ? location.href : ''",
        returnByValue: true,
      });
      return ready.result?.value;
    },
    8000,
    `document ready ${url}`,
  );
  await sleep(150);
}

async function login(client: CdpClient, phone: string) {
  await navigate(client, `${baseUrl}/login`);
  const expression = `
    (() => {
      const setValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(selector + " not found");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setValue("#phone", ${JSON.stringify(phone)});
      setValue("#password", ${JSON.stringify(password)});
      document.querySelector('button[type="submit"]').click();
      return true;
    })()
  `;
  await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  await waitFor(async () => {
    const result = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
      expression: "location.pathname",
      returnByValue: true,
    });
    return result.result?.value !== "/login" ? result.result?.value : null;
  }, 10000, `login ${phone}`);
}

async function checkPage(client: CdpClient, browser: string, viewport: string, route: string): Promise<PageCheck> {
  await navigate(client, `${baseUrl}${route}`);
  const result = await client.send<{ result?: { value?: Omit<PageCheck, "route" | "viewport" | "browser" | "consoleErrors"> } }>("Runtime.evaluate", {
    expression: `
      (() => {
        const doc = document.documentElement;
        const body = document.body;
        const text = body?.innerText || "";
        const title = document.title || "";
        const scrollWidth = Math.ceil(doc.scrollWidth);
        const clientWidth = Math.ceil(doc.clientWidth);
        return {
          url: location.href,
          title,
          h1: document.querySelector("h1")?.innerText || null,
          appError: text.includes("Application error") || text.includes("Unhandled Runtime Error") || text.includes("This page could not be found"),
          horizontalOverflow: scrollWidth > clientWidth + 2,
          scrollWidth,
          clientWidth,
          sample: text.slice(0, 220)
        };
      })()
    `,
    returnByValue: true,
  });
  const value = result.result?.value;
  assert(value, `No page check result for ${route}`);
  return { ...value, route, viewport, browser, consoleErrors: [...client.consoleErrors] };
}

async function assertTextVisibility(client: CdpClient, route: string, visible: string[], hidden: string[], label: string) {
  const result = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", {
    expression: "document.body?.innerText || ''",
    returnByValue: true,
  });
  const text = result.result?.value ?? "";
  for (const item of visible) {
    assert(text.includes(item), `${label}: ${route} should include ${item}`);
  }
  for (const item of hidden) {
    assert(!text.includes(item), `${label}: ${route} should not include ${item}`);
  }
}

async function runBrowser(target: BrowserTarget, accounts: { adminPhone: string; dealerPhone: string; warehousePhone: string; productId: string }) {
  const checks: PageCheck[] = [];
  for (const viewport of viewports) {
    console.log(`Starting ${target.name}/${viewport.name}`);
    const launched = await launchBrowser(target, viewport);
    try {
      const publicRoutes = ["/login", "/register", "/shop", "/shop/catalog", "/shop/cart"];
      for (const route of publicRoutes) {
        const check = await checkPage(launched.client, target.name, viewport.name, route);
        console.log(
          `${check.browser}/${check.viewport} ${check.route} appError=${check.appError ? "Y" : "N"} overflow=${
            check.horizontalOverflow ? `Y(${check.scrollWidth}/${check.clientWidth})` : "N"
          } h1=${check.h1 ?? "-"}`,
        );
        checks.push(check);
      }

      await login(launched.client, accounts.adminPhone);
      const dashboardRoutes = [
        "/dashboard",
        "/dashboard/orders",
        "/dashboard/finance",
        "/dashboard/wechat",
        "/dashboard/settings/users",
        "/dashboard/salespeople",
        `/dashboard/products/${accounts.productId}`,
        `/dashboard/products/${accounts.productId}/edit`,
      ];
      for (const route of dashboardRoutes) {
        const check = await checkPage(launched.client, target.name, viewport.name, route);
        console.log(
          `${check.browser}/${check.viewport} ${check.route} appError=${check.appError ? "Y" : "N"} overflow=${
            check.horizontalOverflow ? `Y(${check.scrollWidth}/${check.clientWidth})` : "N"
          } h1=${check.h1 ?? "-"}`,
        );
        checks.push(check);
        if (route === `/dashboard/products/${accounts.productId}`) {
          await assertTextVisibility(launched.client, route, ["进价", "批发价", "零售价"], [], "管理员产品价格字段");
        }
      }

      await navigate(launched.client, `${baseUrl}/login`);
      await login(launched.client, accounts.warehousePhone);
      const warehouseProductRoute = `/dashboard/products/${accounts.productId}`;
      const warehouseProductCheck = await checkPage(launched.client, target.name, viewport.name, warehouseProductRoute);
      console.log(
        `${warehouseProductCheck.browser}/${warehouseProductCheck.viewport} ${warehouseProductCheck.route} appError=${
          warehouseProductCheck.appError ? "Y" : "N"
        } overflow=${warehouseProductCheck.horizontalOverflow ? `Y(${warehouseProductCheck.scrollWidth}/${warehouseProductCheck.clientWidth})` : "N"} h1=${
          warehouseProductCheck.h1 ?? "-"
        } role=WAREHOUSE`,
      );
      checks.push(warehouseProductCheck);
      await assertTextVisibility(launched.client, warehouseProductRoute, ["零售价", "当前库存"], ["进价", "批发价"], "仓管产品价格字段");

      await navigate(launched.client, `${baseUrl}/login`);
      await login(launched.client, accounts.dealerPhone);
      const dealerRoutes = ["/dealer/incoming", "/dealer/stock", "/dealer/settlement"];
      for (const route of dealerRoutes) {
        const check = await checkPage(launched.client, target.name, viewport.name, route);
        console.log(
          `${check.browser}/${check.viewport} ${check.route} appError=${check.appError ? "Y" : "N"} overflow=${
            check.horizontalOverflow ? `Y(${check.scrollWidth}/${check.clientWidth})` : "N"
          } h1=${check.h1 ?? "-"}`,
        );
        checks.push(check);
      }
    } finally {
      await stopBrowser(launched.child, launched.userDataDir, launched.client);
    }
  }
  return checks;
}

async function main() {
  assertTestDatabase();
  const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5000) });
  assert(response.ok, `Test server is not reachable: ${baseUrl}`);
  const targets = browserTargets();
  assert(targets.length > 0, "No Chrome or Edge executable found");

  const accounts = await ensureAccounts();
  const allChecks: PageCheck[] = [];
  for (const target of targets) {
    allChecks.push(...(await runBrowser(target, accounts)));
  }

  const failures = allChecks.filter((check) => check.appError || check.horizontalOverflow);
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
    throw new Error(`Browser compatibility smoke failed: ${failures.length} page(s)`);
  }

  console.log(`Browser compatibility smoke passed: ${allChecks.length} page checks`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
