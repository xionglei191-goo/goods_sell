import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

import { getWechatFeatureStatus } from "@/features/wechat/config";
import { createOfficialMenu } from "@/features/wechat/official";
import { issueInvoice } from "@/features/receipts/actions";

config({ path: ".env.local" });

const prisma = new PrismaClient();
const baseUrl = process.env.THIRD_PARTY_BASE_URL ?? process.env.PHASE5_BASE_URL ?? "http://localhost:3300";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertTestDatabase() {
  assert(/[?&]schema=goods_sell_test(?:&|$)/.test(process.env.DATABASE_URL ?? ""), "DATABASE_URL must point to schema=goods_sell_test");
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text.
  }
  return { response, body };
}

function jsonData<T>(body: unknown) {
  return (body as { data?: T }).data;
}

function money(value: number) {
  return value.toFixed(2);
}

async function ensureProduct(runId: string) {
  const category = await prisma.category.findFirst({ where: { name: "第三方边界测试" } });
  const categoryId =
    category?.id ??
    (
      await prisma.category.create({
        data: { name: "第三方边界测试", icon: "test", sortOrder: 900, isActive: true },
        select: { id: true },
      })
    ).id;

  const brand = await prisma.brand.upsert({
    where: { name: "AI第三方边界测试" },
    update: {},
    create: { name: "AI第三方边界测试", description: "仅用于 goods_sell_test 自动化测试" },
    select: { id: true },
  });

  return prisma.product.create({
    data: {
      sku: `TP-${runId}`,
      name: `${runId} 微信支付边界测试商品`,
      categoryId,
      brandId: brand.id,
      unit: "瓶",
      spec: "500ml",
      costPrice: money(12),
      wholesalePrice: money(16),
      retailPrice: money(21),
      stock: 20,
      safeStock: 2,
      bulkThreshold: 12,
      status: "ACTIVE",
    },
    select: { id: true, sku: true, name: true, stock: true, retailPrice: true },
  });
}

async function miniLogin(runId: string) {
  const login = await request("/api/wechat/mini/login", {
    method: "POST",
    body: JSON.stringify({
      code: `mock-third-party-${runId}`,
      profile: { nickName: `${runId}-微信客户`, phone: `18${runId.replace(/\D/g, "").slice(-9).padStart(9, "0")}` },
    }),
  });
  assert(login.response.status === 200, "mock 微信登录应返回 200");
  const data = jsonData<{ token: string; customer: { id: string }; mock: boolean }>(login.body);
  assert(data?.token, "mock 微信登录应返回 token");
  assert(data.mock === true, "当前未配置小程序 AppID/Secret 时应使用 mock 登录");
  return data;
}

async function createAddress(token: string, runId: string) {
  const result = await request("/api/wechat/mini/addresses", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "测试客户",
      phone: "13900000000",
      district: "雨湖区",
      detail: `${runId} 第三方边界测试地址`,
      isDefault: true,
    }),
  });
  assert(result.response.status === 200, "小程序地址新增应返回 200");
  const data = jsonData<{ id: string }>(result.body);
  assert(data?.id, "小程序地址新增应返回地址 ID");
  return data;
}

async function createMiniOrder(token: string, productId: string, addressId: string) {
  const addCart = await request("/api/wechat/mini/cart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productId, quantity: 1, replaceQuantity: true }),
  });
  assert(addCart.response.status === 200, "加入购物车应返回 200");

  const cart = await request("/api/wechat/mini/cart", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(cart.response.status === 200, "购物车查询应返回 200");
  const cartItems = jsonData<Array<{ id: string; productId: string }>>(cart.body) ?? [];
  const item = cartItems.find((entry) => entry.productId === productId);
  assert(item?.id, "购物车应包含刚加入的商品");

  const order = await request("/api/wechat/mini/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ addressId, cartItemIds: [item.id], remark: "third-party-boundary-smoke" }),
  });
  assert(order.response.status === 200, "小程序下单应返回 200");
  const data = jsonData<{ id: string; orderNo: string; payableAmount: number; amountFen: number }>(order.body);
  assert(data?.id && data.orderNo, "小程序下单应返回订单 ID 和订单号");
  return data;
}

async function assertPaymentState(orderId: string, expected: { status: string; paidAmount: number; completedPayments: number }) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true, items: { include: { product: true } } },
  });
  assert(order, `订单不存在：${orderId}`);
  assert(order.status === expected.status, `订单状态应为 ${expected.status}，实际 ${order.status}`);
  assert(Number(order.paidAmount) === expected.paidAmount, `订单 paidAmount 应为 ${expected.paidAmount}`);
  const completedPayments = order.payments.filter((payment) => payment.status === "COMPLETED").length;
  assert(completedPayments === expected.completedPayments, `完成收款记录数应为 ${expected.completedPayments}，实际 ${completedPayments}`);
  return order;
}

async function main() {
  assertTestDatabase();
  console.log(`Third-party boundary smoke base: ${baseUrl}`);

  const featureStatus = getWechatFeatureStatus();
  assert(!featureStatus.wechatPayConfigured, "当前脚本只执行 mock 微信支付边界；真实微信支付联调需人工确认并使用正式测试环境");
  assert(!featureStatus.officialAccountConfigured, "当前脚本只执行 mock 公众号菜单；真实公众号菜单发布需人工确认并使用正式测试环境");

  const runId = `TP${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const product = await ensureProduct(runId);
  const initialStock = product.stock;

  const publicHome = await request("/api/wechat/mini/home");
  assert(publicHome.response.status === 200, "小程序首页 API 应返回 200");
  const publicCatalog = await request(`/api/wechat/mini/catalog?keyword=${encodeURIComponent(product.sku)}`);
  assert(publicCatalog.response.status === 200, "小程序目录 API 应返回 200");

  const anonymousPrepay = await request("/api/wechat/pay/prepay", { method: "POST", body: JSON.stringify({ orderId: "missing" }) });
  assert(anonymousPrepay.response.status === 401, "未登录预支付应返回 401");

  const invalidNotify = await request("/api/wechat/pay/notify", {
    method: "POST",
    body: JSON.stringify({ out_trade_no: "", transaction_id: "", amount: {} }),
  });
  assert(invalidNotify.response.status === 400, "非法支付回调应返回 400");

  const login = await miniLogin(runId);
  const address = await createAddress(login.token, runId);
  const order = await createMiniOrder(login.token, product.id, address.id);

  const prepay = await request("/api/wechat/pay/prepay", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ orderId: order.id }),
  });
  assert(prepay.response.status === 200, "mock 预支付应返回 200");
  const prepayData = jsonData<{ mocked: boolean; prepayId: string; payParams: { package: string } }>(prepay.body);
  assert(prepayData?.mocked === true, "未配置微信支付时预支付应返回 mocked=true");
  assert(prepayData.prepayId === `mock_prepay_${order.orderNo}`, "mock prepayId 应绑定订单号");

  const successNotifyBody = {
    out_trade_no: order.orderNo,
    transaction_id: `mock_tx_${runId}`,
    trade_state: "SUCCESS",
    amount: { total: order.amountFen, payer_total: order.amountFen },
  };
  const paidNotify = await request("/api/wechat/pay/notify", { method: "POST", body: JSON.stringify(successNotifyBody) });
  assert(paidNotify.response.status === 200, "mock 成功支付回调应返回 200");
  await assertPaymentState(order.id, { status: "PAID", paidAmount: order.payableAmount, completedPayments: 1 });

  const repeatedNotify = await request("/api/wechat/pay/notify", { method: "POST", body: JSON.stringify(successNotifyBody) });
  assert(repeatedNotify.response.status === 200, "重复支付回调应保持幂等并返回 200");
  await assertPaymentState(order.id, { status: "PAID", paidAmount: order.payableAmount, completedPayments: 1 });

  const paidProduct = await prisma.product.findUnique({ where: { id: product.id }, select: { stock: true, salesCount: true } });
  assert(paidProduct?.stock === initialStock - 1, `支付成功后库存应只扣减 1 次，实际库存 ${paidProduct?.stock}`);

  const underpaidOrder = await createMiniOrder(login.token, product.id, address.id);
  const underpaidNotify = await request("/api/wechat/pay/notify", {
    method: "POST",
    body: JSON.stringify({
      out_trade_no: underpaidOrder.orderNo,
      transaction_id: `mock_underpaid_${runId}`,
      trade_state: "SUCCESS",
      amount: { total: Math.max(1, underpaidOrder.amountFen - 1), payer_total: Math.max(1, underpaidOrder.amountFen - 1) },
    }),
  });
  assert(underpaidNotify.response.status === 400, "少付金额支付回调应返回 400");
  await assertPaymentState(underpaidOrder.id, { status: "PENDING_PAYMENT", paidAmount: 0, completedPayments: 0 });

  const menu = await createOfficialMenu();
  assert(menu.mocked === true, "未配置公众号时菜单同步应写入 mock 日志，不发布真实菜单");
  const latestMenuLog = await prisma.wechatMessageLog.findFirst({
    where: { scene: "official_menu" },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  assert(latestMenuLog?.status === "MOCKED", "公众号菜单 mock 日志状态应为 MOCKED");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true, name: true, phone: true, role: true } });
  assert(admin, "税控 mock 开票测试需要一个管理员账号");
  process.env.AI_TOOL_TEST_SESSION_USER = JSON.stringify({ id: admin.id, name: admin.name, phone: admin.phone, role: admin.role, type: "STAFF" });
  process.env.TAX_PROVIDER = "MOCK";
  const invoiceResult = await issueInvoice({
    orderId: order.id,
    type: "NORMAL",
    buyerName: `${runId} 税控 Mock 公司`,
    buyerTaxNo: `91430000${runId}`,
  });
  if (!invoiceResult.success) {
    throw new Error(invoiceResult.error.message ?? "Mock 开票应成功");
  }
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNo: invoiceResult.data?.invoiceNo },
    select: { provider: true, status: true, content: true },
  });
  assert(invoice?.provider === "MOCK", "未配置税控时发票 provider 应为 MOCK");
  assert(invoice.status === "ISSUED", "Mock 发票状态应为 ISSUED");

  const orderPaidLogs = await prisma.wechatMessageLog.findMany({
    where: { orderId: order.id, scene: "order_paid" },
    select: { status: true, error: true },
  });
  assert(orderPaidLogs.length > 0, "支付成功后应记录公众号模板消息日志");
  assert(orderPaidLogs.some((entry) => entry.status === "SKIPPED" || entry.status === "MOCKED"), "未配置公众号模板时订单消息应 SKIPPED 或 MOCKED");

  console.log(
    JSON.stringify(
      {
        runId,
        productSku: product.sku,
        paidOrderNo: order.orderNo,
        underpaidOrderNo: underpaidOrder.orderNo,
        invoiceNo: invoiceResult.data?.invoiceNo,
        mockedPrepay: prepayData.mocked,
        officialMenu: latestMenuLog.status,
      },
      null,
      2,
    ),
  );
  console.log("Third-party boundary smoke passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
