import { loadEnvConfig } from "@next/env";
import { hash } from "bcryptjs";

import { callAnthropicCompatible, hasAiProvider } from "@/features/ai/provider";
import { executeAiTool, getAvailableAiTools, AiToolError } from "@/features/ai/tools/executor";
import { aiTools } from "@/features/ai/tools/registry";
import type { AiToolContext, AiToolDefinition, AiToolPlan, AiToolRiskLevel } from "@/features/ai/tools/types";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

type CaseStatus = "PASS" | "FAIL" | "BLOCKED";
type TestUser = {
  id: string;
  name: string;
  phone: string;
  role: AiToolContext["role"];
  type: "STAFF" | "CUSTOMER";
};
type SeedData = Awaited<ReturnType<typeof ensureTestData>>;
type FullCase = {
  id: string;
  role: AiToolContext["role"];
  user: TestUser;
  expectedTool: string;
  message: string;
  verify?: (data: SeedData, result: unknown) => Promise<void>;
};
type CaseResult = {
  id: string;
  role: string;
  expectedTool: string;
  actualTool?: string;
  status: CaseStatus;
  note: string;
};

const toolArgumentHints: Record<string, string> = {
  search_products: '{"query":"商品名/SKU/品牌","limit":5}',
  customer_context: "{}",
  customer_submit_order: '{"productQuery":"商品名","quantity":1,"payMethod":"WECHAT"}',
  customer_orders: '{"limit":5}',
  customer_receivables: "{}",
  business_overview: '{"period":"month"}',
  salesperson_performance: '{"salespersonName":"销售员姓名或手机号","period":"month"}',
  search_customers: '{"query":"客户姓名/手机号/标签","limit":8}',
  admin_create_customer: '{"name":"客户名","phone":"13900000000","customerType":"CONSUMER","creditLimit":0,"salesPersonQuery":"销售员手机号","tags":["标签"]}',
  admin_update_customer_profile: '{"customerQuery":"客户手机号","name":"新姓名","creditLimit":1000}',
  admin_assign_customer_salesperson: '{"customerQuery":"客户手机号","salesPersonQuery":"销售员手机号"}',
  admin_update_customer_tags: '{"customerQuery":"客户手机号","tags":["标签"],"mode":"add"}',
  product_operations_summary: '{"query":"商品名/SKU","limit":8}',
  finance_summary: '{"period":"month"}',
  delivery_summary: "{}",
  channel_summary: "{}",
  admin_update_product_price: '{"productQuery":"商品名/SKU","newRetailPrice":19}',
  admin_update_product_status: '{"productQuery":"商品名/SKU","status":"INACTIVE"}',
  warehouse_update_safe_stock: '{"productQuery":"商品名/SKU","safeStock":17}',
  order_status_action: '{"orderNo":"HQ...","action":"ship"}',
  inventory_stock_in: '{"productQuery":"商品名/SKU","quantity":2,"remark":"AI全量测试"}',
  inventory_stock_out: '{"productQuery":"商品名/SKU","quantity":1,"remark":"AI全量测试"}',
  warehouse_create_stock_check: "{}",
  finance_register_payment: '{"customerQuery":"客户手机号","orderNo":"HQ...","amount":5,"method":"TRANSFER"}',
  receipts_issue_invoice: '{"orderNo":"HQ...","type":"NORMAL","buyerName":"购方名称","buyerTaxNo":"税号"}',
  settings_create_staff_user: '{"name":"员工姓名","phone":"13900000000","role":"WAREHOUSE","password":"至少6位"}',
  settings_set_staff_status: '{"userQuery":"员工手机号","isActive":false}',
  settings_reset_staff_password: '{"userQuery":"员工手机号","password":"至少6位"}',
  settings_save_business_config: '{"key":"bulkOrderAmount","value":999}',
  system_launch_readiness: "{}",
  admin_approve_dealer_application: '{"leadQuery":"申请人手机号","shopName":"门店名","zone":"雨湖区","latitude":27.8297,"longitude":112.9441,"serviceRadius":3000,"businessLicense":"TEST-LICENSE","salesPersonQuery":"销售员手机号","notes":"备注"}',
  admin_reject_dealer_application: '{"leadQuery":"申请人手机号","reason":"驳回原因"}',
  admin_update_dealer_policy: '{"dealerQuery":"经销商门店/手机号","minOrderAmount":100,"priceLevel":"WHOLESALE","allowCrossZone":true,"allowReject":true,"priority":2}',
  admin_set_dealer_accepting: '{"dealerQuery":"经销商门店/手机号","isActive":false}',
  admin_dealer_conflicts: '{"dealerQuery":"经销商门店/手机号","limit":8}',
  marketing_create_coupon: '{"name":"优惠券名","couponType":"AMOUNT","amount":10,"threshold":100,"totalQuantity":20}',
  marketing_issue_coupon: '{"couponQuery":"优惠券名","tag":"客户标签"}',
  marketing_create_product_push: '{"productQuery":"商品名/SKU","targetTag":"客户标签","message":"推送话术"}',
  dealer_incoming_orders: "{}",
  dealer_report_stock: '{"productQuery":"商品名/SKU","stock":9}',
  dealer_settlement_summary: "{}",
  dealer_accept_routing: '{"routingId":"订单号或routingId"}',
  dealer_reject_routing: '{"routingId":"订单号或routingId","reason":"拒单原因"}',
  admin_create_product_draft: '{"text":"商品口述内容"}',
  orders_manual_order_draft: '{"text":"开单口述内容"}',
  marketing_coupon_draft: '{"text":"优惠券活动口述内容"}',
  marketing_product_push_draft: '{"text":"新品推送口述内容"}',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/[?&]schema=goods_sell_test(?:&|$)/.test(databaseUrl)) {
    throw new Error("拒绝执行：DATABASE_URL 必须指向 schema=goods_sell_test。请临时覆盖 DATABASE_URL 后重试。");
  }
}

function assertProvider() {
  if (!hasAiProvider()) throw new Error("AI provider 未配置，请先运行 npm.cmd run sync:ai-provider-env 或补齐 .env.local");
  const thinking = process.env.AI_THINKING_ENABLED === "1" || process.env.AI_THINKING_ENABLED?.toLowerCase() === "true";
  if (!thinking) throw new Error("AI_THINKING_ENABLED 未开启，本轮真实 AI 全量测试要求开启 think 模式");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiToolPlan;
  } catch {
    return null;
  }
}

function describeTools(tools: readonly AiToolDefinition[]) {
  return tools
    .map((tool) => `- ${tool.name}｜${tool.title}｜${tool.riskLevel}｜${tool.description}｜args示例 ${toolArgumentHints[tool.name] ?? "{}"}`)
    .join("\n");
}

async function planWithProvider(testCase: FullCase) {
  const context = buildContext(testCase.user);
  const tools = getAvailableAiTools(context);
  const toolNames = tools.map((tool) => tool.name).join(", ");
  const text = await callAnthropicCompatible({
    maxTokens: 2048,
    system:
      `你是业务系统的 AI 工具规划器。必须只从可用工具中选择一个最匹配的工具。只返回 JSON，不要解释，不要 Markdown。JSON 格式：{"toolName":"工具名","args":{},"reason":"简短原因"}。toolName 必须逐字复制可用工具名之一，不能缩写、翻译或自造别名。可用工具名全集：${toolNames}。常见错误：上线检查必须返回 system_launch_readiness，不能返回 system_launch_ready；新品推送写操作必须返回 marketing_create_product_push，不能返回 marketing_product_push。args 必须是合法 JSON，布尔值必须使用 true/false，数字必须使用 number。`,
    messages: [
      {
        role: "user",
        content: `当前角色：${testCase.role}\n可用工具：\n${describeTools(tools)}\n\n用户请求：${testCase.message}`,
      },
    ],
  });
  const parsed = extractJsonObject(text);
  if (!parsed?.toolName || typeof parsed.args !== "object" || !parsed.args) {
    throw new Error(`provider 未返回可解析 plan：${text.slice(0, 300)}`);
  }
  return parsed;
}

function buildContext(user: TestUser): AiToolContext {
  return {
    role: user.role,
    isStaff: user.type === "STAFF",
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      type: user.type,
    },
  };
}

async function withTestSession<T>(context: AiToolContext, action: () => Promise<T>) {
  const previous = process.env.AI_TOOL_TEST_SESSION_USER;
  process.env.AI_TOOL_TEST_SESSION_USER = JSON.stringify(context.user);
  try {
    return await action();
  } finally {
    if (previous === undefined) {
      delete process.env.AI_TOOL_TEST_SESSION_USER;
    } else {
      process.env.AI_TOOL_TEST_SESSION_USER = previous;
    }
  }
}

function otherContext(context: AiToolContext): AiToolContext {
  return {
    ...context,
    user: {
      ...context.user,
      id: `${context.user.id}-other`,
      name: `${context.user.name ?? context.role}-other`,
    },
  };
}

function isWriteRisk(risk: AiToolRiskLevel) {
  return risk === "WRITE" || risk === "HIGH_RISK";
}

function phone(seed: number, offset: number) {
  return `139${String(seed + offset).padStart(8, "0").slice(-8)}`;
}

function money(value: number) {
  return value.toFixed(2);
}

async function createOrder(input: {
  orderNo: string;
  customerId: string;
  addressId: string;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  status: "PENDING_PAYMENT" | "PAID" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "COMPLETED";
  paidAmount?: number;
  routingType?: "WAREHOUSE" | "DEALER";
  salesPersonId?: string | null;
}) {
  const total = input.unitPrice * input.quantity;
  return prisma.order.create({
    data: {
      orderNo: input.orderNo,
      customerId: input.customerId,
      type: "RETAIL",
      status: input.status,
      totalAmount: money(total),
      discountAmount: "0.00",
      payableAmount: money(total),
      paidAmount: money(input.paidAmount ?? (input.status === "PENDING_PAYMENT" ? 0 : total)),
      payMethod: input.status === "PENDING_PAYMENT" ? "CREDIT" : "TRANSFER",
      source: "MANUAL",
      addressId: input.addressId,
      routingType: input.routingType ?? "WAREHOUSE",
      salesPersonId: input.salesPersonId ?? null,
      remark: "AI 全量测试订单",
      items: {
        create: {
          productId: input.productId,
          productName: input.productName,
          sku: input.sku,
          unitPrice: money(input.unitPrice),
          quantity: input.quantity,
          totalAmount: money(total),
        },
      },
      payments:
        (input.paidAmount ?? (input.status === "PENDING_PAYMENT" ? 0 : total)) > 0
          ? {
              create: {
                customerId: input.customerId,
                type: "RECEIVE",
                amount: money(input.paidAmount ?? total),
                method: "TRANSFER",
                status: "COMPLETED",
                paidAt: new Date(),
                transactionId: `AI-FULL-${input.orderNo}`,
              },
            }
          : undefined,
    },
    include: { items: true },
  });
}

async function ensureTestData() {
  const runId = `AI-FULL-${Date.now().toString(36).toUpperCase()}`;
  const short = runId.replace(/[^A-Z0-9]/g, "").slice(-8);
  const seed = Number(String(Date.now()).slice(-8));
  const password = await hash("aiFull123", 12);

  const admin = await prisma.user.create({ data: { name: `${runId}-管理员`, phone: phone(seed, 1), password, role: "ADMIN" } });
  const salesperson = await prisma.user.create({ data: { name: `${runId}-销售员A`, phone: phone(seed, 2), password, role: "SALESPERSON" } });
  const salespersonB = await prisma.user.create({ data: { name: `${runId}-销售员B`, phone: phone(seed, 3), password, role: "SALESPERSON" } });
  const warehouse = await prisma.user.create({ data: { name: `${runId}-仓管`, phone: phone(seed, 4), password, role: "WAREHOUSE" } });
  const finance = await prisma.user.create({ data: { name: `${runId}-财务`, phone: phone(seed, 5), password, role: "FINANCE" } });
  const staffTarget = await prisma.user.create({ data: { name: `${runId}-待禁用员工`, phone: phone(seed, 6), password, role: "WAREHOUSE" } });

  const category = await prisma.category.create({ data: { name: `${runId}-测试分类`, sortOrder: 99 } });
  const brand = await prisma.brand.create({ data: { name: `${runId}-测试品牌`, description: "AI 全量测试品牌" } });
  const product = await prisma.product.create({
    data: {
      sku: `AIFULL-JLC-${short}`,
      name: `${runId} 剑兰春`,
      categoryId: category.id,
      brandId: brand.id,
      unit: "箱",
      spec: "500ml*6",
      costPrice: "40.00",
      wholesalePrice: "55.00",
      retailPrice: "80.00",
      memberPrice: "75.00",
      stock: 200,
      safeStock: 20,
      bulkThreshold: 9999,
      description: "AI 全量测试商品",
      status: "ACTIVE",
    },
  });
  const stockProduct = await prisma.product.create({
    data: {
      sku: `AIFULL-STK-${short}`,
      name: `${runId} 香脆薯片组合装`,
      categoryId: category.id,
      brandId: brand.id,
      unit: "袋",
      spec: "220g",
      costPrice: "8.00",
      wholesalePrice: "11.00",
      retailPrice: "15.00",
      stock: 100,
      safeStock: 10,
      bulkThreshold: 50,
      status: "ACTIVE",
    },
  });
  const statusProduct = await prisma.product.create({
    data: {
      sku: `AIFULL-OFF-${short}`,
      name: `${runId} 临时上下架商品`,
      categoryId: category.id,
      brandId: brand.id,
      unit: "瓶",
      costPrice: "10.00",
      wholesalePrice: "13.00",
      retailPrice: "18.00",
      stock: 50,
      safeStock: 5,
      status: "ACTIVE",
    },
  });
  const pushProduct = await prisma.product.create({
    data: {
      sku: `AIFULL-NEW-${short}`,
      name: `${runId} 新品果汁`,
      categoryId: category.id,
      brandId: brand.id,
      unit: "箱",
      spec: "300ml*12",
      costPrice: "30.00",
      wholesalePrice: "42.00",
      retailPrice: "58.00",
      stock: 80,
      safeStock: 10,
      status: "ACTIVE",
      description: "适合新品推送测试",
    },
  });

  async function createCustomer(offset: number, name: string, type: "CONSUMER" | "DEALER", salesPersonId = salesperson.id, tag?: string) {
    return prisma.customer.create({
      data: {
        name,
        phone: phone(seed, offset),
        password,
        type,
        isVerified: true,
        creditLimit: type === "DEALER" ? "50000.00" : "1000.00",
        salesPersonId,
        addresses: {
          create: {
            name,
            phone: phone(seed, offset),
            province: "湖南省",
            city: "湘潭市",
            district: "雨湖区",
            detail: `${runId} 测试路 ${offset} 号`,
            isDefault: true,
          },
        },
        tags: tag ? { create: { name: tag, color: "#10b981", source: "AI_FULL" } } : undefined,
        profile: { create: { preferredCategories: ["酒类", "饮料"], tags: tag ? { labels: [tag] } : { labels: [] } } },
      },
      include: { addresses: true },
    });
  }

  const targetTag = `${runId}-高价值`;
  const consumer = await createCustomer(20, `${runId}-消费者`, "CONSUMER", salesperson.id, targetTag);
  const profileCustomer = await createCustomer(21, `${runId}-资料客户`, "CONSUMER", salesperson.id, `${runId}-老客`);
  const financeCustomer = await createCustomer(22, `${runId}-财务客户`, "CONSUMER", salesperson.id, targetTag);
  const dealerCustomer = await createCustomer(23, `${runId}-莲城便利店`, "DEALER", salesperson.id, "经销商");
  const dealer = await prisma.dealer.create({
    data: {
      customerId: dealerCustomer.id,
      shopName: `${runId}-莲城便利店`,
      businessLicense: `TEST-${short}`,
      latitude: "27.858480",
      longitude: "112.917620",
      serviceRadius: 3000,
      zone: "雨湖区",
      isAccepting: true,
    },
  });

  const approveCustomer = await prisma.customer.create({
    data: { name: `${runId}-待通过经销商`, phone: phone(seed, 24), password, type: "DEALER", isVerified: false, salesPersonId: salesperson.id },
  });
  const rejectCustomer = await prisma.customer.create({
    data: { name: `${runId}-待驳回经销商`, phone: phone(seed, 25), password, type: "DEALER", isVerified: false, salesPersonId: salesperson.id },
  });
  const approveLead = await prisma.lead.create({
    data: { source: "MANUAL", scene: "DEALER_JOIN", status: "NEW", name: approveCustomer.name, phone: approveCustomer.phone, customerId: approveCustomer.id, salespersonId: salesperson.id, consentAccepted: true },
  });
  const rejectLead = await prisma.lead.create({
    data: { source: "MANUAL", scene: "DEALER_JOIN", status: "NEW", name: rejectCustomer.name, phone: rejectCustomer.phone, customerId: rejectCustomer.id, salespersonId: salesperson.id, consentAccepted: true },
  });

  await prisma.dealerStock.create({ data: { dealerId: dealer.id, productId: product.id, stock: 5 } });
  const consumerOrder = await createOrder({ orderNo: `HQ${short}CUST01`, customerId: consumer.id, addressId: consumer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 80, quantity: 1, status: "PAID", salesPersonId: salesperson.id });
  const receivableOrder = await createOrder({ orderNo: `HQ${short}DEBT01`, customerId: consumer.id, addressId: consumer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 80, quantity: 1, status: "PENDING_PAYMENT", paidAmount: 0, salesPersonId: salesperson.id });
  const financeOrder = await createOrder({ orderNo: `HQ${short}FIN001`, customerId: financeCustomer.id, addressId: financeCustomer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 50, quantity: 1, status: "PENDING_PAYMENT", paidAmount: 0, salesPersonId: salesperson.id });
  const invoiceOrder = await createOrder({ orderNo: `HQ${short}INV001`, customerId: financeCustomer.id, addressId: financeCustomer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 60, quantity: 1, status: "PAID", paidAmount: 60, salesPersonId: salesperson.id });
  const statusOrder = await createOrder({ orderNo: `HQ${short}SHIP01`, customerId: consumer.id, addressId: consumer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 80, quantity: 1, status: "PAID", salesPersonId: salesperson.id });
  const dealerAcceptOrder = await createOrder({ orderNo: `HQ${short}ACC001`, customerId: consumer.id, addressId: consumer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 80, quantity: 1, status: "PAID", routingType: "DEALER", salesPersonId: salesperson.id });
  const dealerRejectOrder = await createOrder({ orderNo: `HQ${short}REJ001`, customerId: consumer.id, addressId: consumer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 80, quantity: 1, status: "PAID", routingType: "DEALER", salesPersonId: salesperson.id });
  const dealerCompletedOrder = await createOrder({ orderNo: `HQ${short}DONE01`, customerId: consumer.id, addressId: consumer.addresses[0].id, productId: product.id, productName: product.name, sku: product.sku, unitPrice: 80, quantity: 1, status: "COMPLETED", routingType: "DEALER", salesPersonId: salesperson.id });
  await prisma.orderRouting.createMany({
    data: [
      { orderId: dealerAcceptOrder.id, dealerId: dealer.id, status: "PENDING", distance: "500.00" },
      { orderId: dealerRejectOrder.id, dealerId: dealer.id, status: "PENDING", distance: "800.00" },
      { orderId: dealerCompletedOrder.id, dealerId: dealer.id, status: "ACCEPTED", distance: "600.00", respondedAt: new Date() },
    ],
  });

  const coupon = await prisma.coupon.create({
    data: {
      name: `${runId}-待发放券`,
      type: "AMOUNT",
      amount: "5.00",
      threshold: "20.00",
      totalQuantity: 50,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  await prisma.channelConflict.create({
    data: {
      type: "REJECTION",
      status: "OPEN",
      orderId: dealerRejectOrder.id,
      dealerId: dealer.id,
      customerId: consumer.id,
      ownerId: salesperson.id,
      summary: `${runId} 经销商拒单冲突`,
      detail: { source: "AI_FULL" },
    },
  });

  return {
    runId,
    users: {
      admin: { id: admin.id, name: admin.name, phone: admin.phone, role: "ADMIN" as const, type: "STAFF" as const },
      salesperson: { id: salesperson.id, name: salesperson.name, phone: salesperson.phone, role: "SALESPERSON" as const, type: "STAFF" as const },
      salespersonB: { id: salespersonB.id, name: salespersonB.name, phone: salespersonB.phone, role: "SALESPERSON" as const, type: "STAFF" as const },
      warehouse: { id: warehouse.id, name: warehouse.name, phone: warehouse.phone, role: "WAREHOUSE" as const, type: "STAFF" as const },
      finance: { id: finance.id, name: finance.name, phone: finance.phone, role: "FINANCE" as const, type: "STAFF" as const },
      consumer: { id: consumer.id, name: consumer.name, phone: consumer.phone, role: "CONSUMER" as const, type: "CUSTOMER" as const },
      dealer: { id: dealerCustomer.id, name: dealerCustomer.name, phone: dealerCustomer.phone, role: "DEALER" as const, type: "CUSTOMER" as const },
    },
    staffTarget,
    products: { product, stockProduct, statusProduct, pushProduct },
    customers: { consumer, profileCustomer, financeCustomer, dealerCustomer },
    dealer,
    leads: { approveLead, rejectLead },
    orders: { consumerOrder, receivableOrder, financeOrder, invoiceOrder, statusOrder, dealerAcceptOrder, dealerRejectOrder, dealerCompletedOrder },
    coupon,
    targetTag,
    newCustomerPhone: phone(seed, 30),
    createStaffPhone: phone(seed, 31),
  };
}

function buildCases(data: SeedData): FullCase[] {
  const { users, products, customers, orders, leads, dealer, coupon, targetTag } = data;
  return [
    { id: "AI-FULL-001", role: "CONSUMER", user: users.consumer, expectedTool: "search_products", message: `查一下 ${products.product.name} 的价格库存` },
    { id: "AI-FULL-002", role: "CONSUMER", user: users.consumer, expectedTool: "customer_context", message: "我的默认地址和最近订单摘要怎么样" },
    { id: "AI-FULL-003", role: "CONSUMER", user: users.consumer, expectedTool: "customer_submit_order", message: `我要下单 1 箱 ${products.product.name}，微信支付` },
    { id: "AI-FULL-004", role: "CONSUMER", user: users.consumer, expectedTool: "customer_orders", message: "查看我的最近订单和配送状态" },
    { id: "AI-FULL-005", role: "CONSUMER", user: users.consumer, expectedTool: "customer_receivables", message: "我现在有哪些待付款和欠款" },
    { id: "AI-FULL-006", role: "ADMIN", user: users.admin, expectedTool: "business_overview", message: "这个月经营总览怎么样" },
    { id: "AI-FULL-007", role: "ADMIN", user: users.admin, expectedTool: "salesperson_performance", message: `这个月 ${users.salesperson.name} 的业绩怎么样` },
    { id: "AI-FULL-008", role: "ADMIN", user: users.admin, expectedTool: "search_customers", message: `查客户 ${customers.consumer.phone} 的欠款和最近订单` },
    { id: "AI-FULL-009", role: "ADMIN", user: users.admin, expectedTool: "admin_create_customer", message: `新增客户 ${data.runId}-新增客户 手机号 ${data.newCustomerPhone} 标签 AI全量新客，归属销售员 ${users.salesperson.phone}` },
    { id: "AI-FULL-010", role: "ADMIN", user: users.admin, expectedTool: "admin_update_customer_profile", message: `把客户 ${customers.profileCustomer.phone} 的信用额度改成 888` },
    { id: "AI-FULL-011", role: "ADMIN", user: users.admin, expectedTool: "admin_assign_customer_salesperson", message: `把客户 ${customers.profileCustomer.phone} 归属给销售员 ${users.salespersonB.phone}` },
    { id: "AI-FULL-012", role: "SALESPERSON", user: users.salesperson, expectedTool: "admin_update_customer_tags", message: `给客户 ${customers.consumer.phone} 追加标签 ${data.runId}-复购` },
    { id: "AI-FULL-013", role: "ADMIN", user: users.admin, expectedTool: "product_operations_summary", message: `查一下 ${products.product.name} 的库存销量和毛利` },
    { id: "AI-FULL-014", role: "FINANCE", user: users.finance, expectedTool: "finance_summary", message: "这个月财务应收和回款趋势怎么样" },
    { id: "AI-FULL-015", role: "WAREHOUSE", user: users.warehouse, expectedTool: "delivery_summary", message: "查看配送摘要，待发货和配送中有多少" },
    { id: "AI-FULL-016", role: "SALESPERSON", user: users.salesperson, expectedTool: "channel_summary", message: "查看渠道经营摘要，经销商线索和冲突情况" },
    {
      id: "AI-FULL-017",
      role: "ADMIN",
      user: users.admin,
      expectedTool: "admin_update_product_price",
      message: `把 SKU ${products.product.sku} 的零售价改成 81`,
      verify: async () => {
        const product = await prisma.product.findUnique({ where: { id: products.product.id }, select: { retailPrice: true } });
        assert(Number(product?.retailPrice) === 81, "商品调价未落到预期 SKU");
      },
    },
    {
      id: "AI-FULL-018",
      role: "ADMIN",
      user: users.admin,
      expectedTool: "admin_update_product_status",
      message: `把 SKU ${products.statusProduct.sku} 下架`,
      verify: async () => {
        const [target, main] = await Promise.all([
          prisma.product.findUnique({ where: { id: products.statusProduct.id }, select: { status: true } }),
          prisma.product.findUnique({ where: { id: products.product.id }, select: { status: true } }),
        ]);
        assert(target?.status === "INACTIVE", "商品上下架未落到预期 SKU");
        assert(main?.status === "ACTIVE", "商品上下架误伤主测试商品");
      },
    },
    {
      id: "AI-FULL-019",
      role: "WAREHOUSE",
      user: users.warehouse,
      expectedTool: "warehouse_update_safe_stock",
      message: `把 SKU ${products.stockProduct.sku} 的安全库存调整为 17`,
      verify: async () => {
        const product = await prisma.product.findUnique({ where: { id: products.stockProduct.id }, select: { safeStock: true } });
        assert(product?.safeStock === 17, "安全库存未落到预期 SKU");
      },
    },
    { id: "AI-FULL-020", role: "WAREHOUSE", user: users.warehouse, expectedTool: "order_status_action", message: `把订单 ${orders.statusOrder.orderNo} 发货` },
    { id: "AI-FULL-021", role: "WAREHOUSE", user: users.warehouse, expectedTool: "inventory_stock_in", message: `给 SKU ${products.stockProduct.sku} 入库 2 件，备注 AI全量测试` },
    { id: "AI-FULL-022", role: "WAREHOUSE", user: users.warehouse, expectedTool: "inventory_stock_out", message: `给 SKU ${products.stockProduct.sku} 出库 1 件，备注 AI全量测试` },
    { id: "AI-FULL-023", role: "WAREHOUSE", user: users.warehouse, expectedTool: "warehouse_create_stock_check", message: "新建一张全量盘点任务" },
    { id: "AI-FULL-024", role: "FINANCE", user: users.finance, expectedTool: "finance_register_payment", message: `给客户 ${customers.financeCustomer.phone} 的订单 ${orders.financeOrder.orderNo} 登记收款 5 元，转账` },
    { id: "AI-FULL-025", role: "FINANCE", user: users.finance, expectedTool: "receipts_issue_invoice", message: `给订单 ${orders.invoiceOrder.orderNo} 开普票，购方 ${data.runId}-测试公司，税号 91430000MAFULLTEST` },
    { id: "AI-FULL-026", role: "ADMIN", user: users.admin, expectedTool: "settings_create_staff_user", message: `创建员工账号 ${data.runId}-新增仓管 手机号 ${data.createStaffPhone} 角色 WAREHOUSE 密码 AiFull123` },
    { id: "AI-FULL-027", role: "ADMIN", user: users.admin, expectedTool: "settings_set_staff_status", message: `禁用员工 ${data.staffTarget.phone}` },
    { id: "AI-FULL-028", role: "ADMIN", user: users.admin, expectedTool: "settings_reset_staff_password", message: `重置员工 ${data.staffTarget.phone} 密码为 AiFull456` },
    { id: "AI-FULL-029", role: "ADMIN", user: users.admin, expectedTool: "settings_save_business_config", message: "把业务参数 bulkOrderAmount 调整为 999" },
    { id: "AI-FULL-030", role: "ADMIN", user: users.admin, expectedTool: "system_launch_readiness", message: "现在上线还差什么配置" },
    { id: "AI-FULL-031", role: "ADMIN", user: users.admin, expectedTool: "admin_approve_dealer_application", message: `通过经销商申请 ${leads.approveLead.phone}，门店名 ${data.runId}-通过门店，区域 雨湖区，服务半径 3000 米，归属销售员 ${users.salesperson.phone}` },
    { id: "AI-FULL-032", role: "ADMIN", user: users.admin, expectedTool: "admin_reject_dealer_application", message: `驳回经销商申请 ${leads.rejectLead.phone}，原因 资料不完整` },
    { id: "AI-FULL-033", role: "ADMIN", user: users.admin, expectedTool: "admin_update_dealer_policy", message: `把经销商 ${dealer.shopName} 政策最低订单改成 100，价格等级 WHOLESALE，允许跨区，优先级 2` },
    { id: "AI-FULL-034", role: "ADMIN", user: users.admin, expectedTool: "admin_set_dealer_accepting", message: `暂停经销商 ${dealer.shopName} 接单` },
    { id: "AI-FULL-035", role: "ADMIN", user: users.admin, expectedTool: "admin_dealer_conflicts", message: `查看 ${dealer.shopName} 的渠道冲突` },
    { id: "AI-FULL-036", role: "SALESPERSON", user: users.salesperson, expectedTool: "marketing_create_coupon", message: `创建优惠券 ${data.runId}-满减券，满100减10，共20张` },
    { id: "AI-FULL-037", role: "ADMIN", user: users.admin, expectedTool: "marketing_issue_coupon", message: `给标签 ${targetTag} 的客户发放优惠券 ${coupon.name}` },
    {
      id: "AI-FULL-038",
      role: "SALESPERSON",
      user: users.salesperson,
      expectedTool: "marketing_create_product_push",
      message: `把新品 SKU ${products.pushProduct.sku} 推送给 ${targetTag} 人群，话术 新品试饮可咨询`,
      verify: async () => {
        const count = await prisma.productPush.count({ where: { productId: products.pushProduct.id, targetTag } });
        assert(count > 0, "新品推送未落到预期 SKU");
      },
    },
    { id: "AI-FULL-039", role: "DEALER", user: users.dealer, expectedTool: "dealer_incoming_orders", message: "查一下我的待接订单" },
    {
      id: "AI-FULL-040",
      role: "DEALER",
      user: users.dealer,
      expectedTool: "dealer_report_stock",
      message: `把 SKU ${products.product.sku} 门店库存上报为 9`,
      verify: async () => {
        const stock = await prisma.dealerStock.findUnique({ where: { dealerId_productId: { dealerId: dealer.id, productId: products.product.id } }, select: { stock: true } });
        assert(stock?.stock === 9, "经销商库存未落到预期 SKU");
      },
    },
    { id: "AI-FULL-041", role: "DEALER", user: users.dealer, expectedTool: "dealer_settlement_summary", message: "本月结算摘要和完成订单金额" },
    { id: "AI-FULL-042", role: "DEALER", user: users.dealer, expectedTool: "dealer_accept_routing", message: `接单 ${orders.dealerAcceptOrder.orderNo}` },
    { id: "AI-FULL-043", role: "DEALER", user: users.dealer, expectedTool: "dealer_reject_routing", message: `拒单 ${orders.dealerRejectOrder.orderNo} 原因 太远` },
    { id: "AI-FULL-044", role: "ADMIN", user: users.admin, expectedTool: "admin_create_product_draft", message: `新增商品草稿：${data.runId} 果味汽水 330ml 成本 20 批发 30 零售 45` },
    { id: "AI-FULL-045", role: "SALESPERSON", user: users.salesperson, expectedTool: "orders_manual_order_draft", message: `帮客户 ${customers.consumer.phone} 开单 1 箱 ${products.product.name}` },
    { id: "AI-FULL-046", role: "SALESPERSON", user: users.salesperson, expectedTool: "marketing_coupon_draft", message: "创建优惠券活动草稿，满200减20，发100张" },
    { id: "AI-FULL-047", role: "SALESPERSON", user: users.salesperson, expectedTool: "marketing_product_push_draft", message: `生成新品推送草稿，把 ${products.pushProduct.name} 发给高价值客户` },
  ];
}

async function verifyAudit(toolName: string, since: Date) {
  const logs = await prisma.auditLog.findMany({
    where: { module: "AI助手", targetId: toolName, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  assert(logs.length > 0, `缺少 AI助手 审计日志：${toolName}`);
  const text = JSON.stringify(logs.map((log) => log.after));
  assert(!/password|confirmationToken|secret|apiKey|authorization|confirmText/i.test(text), `审计日志包含敏感字段：${toolName}`);
}

async function runCase(testCase: FullCase, data: SeedData): Promise<CaseResult> {
  const since = new Date();
  let plan: AiToolPlan | null = null;
  try {
    plan = await planWithProvider(testCase);
    if (plan.toolName !== testCase.expectedTool) {
      return { id: testCase.id, role: testCase.role, expectedTool: testCase.expectedTool, actualTool: plan.toolName, status: "FAIL", note: `provider 命中错误 tool：${plan.toolName}` };
    }

    const tool = aiTools.find((item) => item.name === testCase.expectedTool);
    assert(tool, `工具不存在：${testCase.expectedTool}`);
    const parsed = tool.inputSchema.safeParse(plan.args);
    if (!parsed.success) {
      return {
        id: testCase.id,
        role: testCase.role,
        expectedTool: testCase.expectedTool,
        actualTool: plan.toolName,
        status: "FAIL",
        note: `provider args 不符合 schema：${parsed.error.issues[0]?.message ?? "参数错误"}；args=${JSON.stringify(plan.args).slice(0, 180)}`,
      };
    }

    const context = buildContext(testCase.user);
    const execution = await withTestSession(context, () => executeAiTool(plan!.toolName, plan!.args, context));
    if (isWriteRisk(tool.riskLevel)) {
      assert(execution.status === "needs_confirmation", "写操作未先生成确认卡");
      assert(execution.card.kind === "confirmation", "写操作未返回确认卡");
      const pending = execution.pendingAction;

      let missingTokenBlocked = false;
      try {
        await withTestSession(context, () => executeAiTool(plan!.toolName, plan!.args, context, { confirmed: true, confirmText: tool.riskLevel === "HIGH_RISK" ? "确认执行" : undefined }));
      } catch (error) {
        missingTokenBlocked = error instanceof AiToolError && error.status === 400;
      }
      assert(missingTokenBlocked, "缺 token 未被拦截");

      let tamperedBlocked = false;
      try {
        await withTestSession(context, () => executeAiTool(plan!.toolName, plan!.args, context, { confirmed: true, confirmationToken: `${pending.confirmationToken}x`, confirmText: tool.riskLevel === "HIGH_RISK" ? "确认执行" : undefined }));
      } catch (error) {
        tamperedBlocked = error instanceof AiToolError && error.status === 400;
      }
      assert(tamperedBlocked, "篡改 token 未被拦截");

      let crossUserBlocked = false;
      const another = otherContext(context);
      try {
        await withTestSession(another, () => executeAiTool(plan!.toolName, plan!.args, another, { confirmed: true, confirmationToken: pending.confirmationToken, confirmText: tool.riskLevel === "HIGH_RISK" ? "确认执行" : undefined }));
      } catch (error) {
        crossUserBlocked = error instanceof AiToolError && error.status === 400;
      }
      assert(crossUserBlocked, "跨用户 token 未被拦截");

      if (tool.riskLevel === "HIGH_RISK") {
        let confirmTextBlocked = false;
        try {
          await withTestSession(context, () => executeAiTool(plan!.toolName, plan!.args, context, { confirmed: true, confirmationToken: pending.confirmationToken, confirmText: "我确认" }));
        } catch (error) {
          confirmTextBlocked = error instanceof AiToolError && error.status === 400;
        }
        assert(confirmTextBlocked, "高风险确认文字错误未被拦截");
      }

      const confirmed = await withTestSession(context, () =>
        executeAiTool(plan!.toolName, plan!.args, context, {
          confirmed: true,
          confirmationToken: pending.confirmationToken,
          confirmText: tool.riskLevel === "HIGH_RISK" ? "确认执行" : undefined,
        }),
      );
      assert(confirmed.status === "success", "确认执行未成功");
      await verifyAudit(tool.name, since);
      await testCase.verify?.(data, confirmed.result);
      return { id: testCase.id, role: testCase.role, expectedTool: testCase.expectedTool, actualTool: plan.toolName, status: "PASS", note: confirmed.result.summary };
    }

    assert(execution.status === "success", "只读/草稿工具未成功返回");
    await testCase.verify?.(data, execution.result);
    return { id: testCase.id, role: testCase.role, expectedTool: testCase.expectedTool, actualTool: plan.toolName, status: "PASS", note: execution.result.summary };
  } catch (error) {
    return {
      id: testCase.id,
      role: testCase.role,
      expectedTool: testCase.expectedTool,
      actualTool: plan?.toolName,
      status: "FAIL",
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runUnauthorizedChecks(data: SeedData) {
  const checks = [
    { role: "CONSUMER" as const, user: data.users.consumer, tool: "business_overview", args: { period: "month" } },
    { role: "SALESPERSON" as const, user: data.users.salesperson, tool: "settings_create_staff_user", args: { name: "越权员工", phone: data.createStaffPhone, role: "WAREHOUSE", password: "AiFull123" } },
    { role: "WAREHOUSE" as const, user: data.users.warehouse, tool: "finance_register_payment", args: { customerQuery: data.customers.financeCustomer.phone, orderNo: data.orders.financeOrder.orderNo, amount: 1, method: "TRANSFER" } },
    { role: "FINANCE" as const, user: data.users.finance, tool: "order_status_action", args: { orderNo: data.orders.statusOrder.orderNo, action: "ship" } },
    { role: "DEALER" as const, user: data.users.dealer, tool: "system_launch_readiness", args: {} },
  ];
  for (const check of checks) {
    const context = buildContext(check.user);
    let blocked = false;
    try {
      await withTestSession(context, () => executeAiTool(check.tool, check.args, context));
    } catch (error) {
      blocked = error instanceof AiToolError && error.status === 403;
    }
    assert(blocked, `${check.role} 越权调用 ${check.tool} 未被 403 拦截`);
  }
}

async function main() {
  assertTestDatabase();
  assertProvider();
  const data = await ensureTestData();
  const cases = buildCases(data);
  assert(cases.length === aiTools.length, `用例数量 ${cases.length} 与 tool 数量 ${aiTools.length} 不一致`);

  console.log(`AI full provider coverage started: runId=${data.runId}, tools=${cases.length}, thinking=enabled`);
  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const result = await runCase(testCase, data);
    results.push(result);
    console.log(`${result.status} ${result.id} ${result.role} ${result.expectedTool} actual=${result.actualTool ?? "-"} ${result.note.slice(0, 160)}`);
  }

  try {
    await runUnauthorizedChecks(data);
    console.log("PASS AI-FULL-RBAC unauthorized checks");
  } catch (error) {
    results.push({
      id: "AI-FULL-RBAC",
      role: "MATRIX",
      expectedTool: "unauthorized_checks",
      status: "FAIL",
      note: error instanceof Error ? error.message : String(error),
    });
  }

  const passed = results.filter((item) => item.status === "PASS").length;
  const failed = results.filter((item) => item.status === "FAIL").length;
  const blocked = results.filter((item) => item.status === "BLOCKED").length;
  console.log(`AI full provider coverage finished: PASS=${passed} FAIL=${failed} BLOCKED=${blocked}`);

  if (failed || blocked) {
    console.log("Failed cases:");
    for (const result of results.filter((item) => item.status !== "PASS")) {
      console.log(JSON.stringify(result));
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.AI_TOOL_TEST_SESSION_USER;
    await prisma.$disconnect();
  });
