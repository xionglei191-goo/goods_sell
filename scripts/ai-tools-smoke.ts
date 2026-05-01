import { redactAiAuditText, redactAiAuditValue } from "@/features/ai/tools/audit";
import { rankAiToolsForMessage } from "@/features/ai/tools/model-planner";
import { aiTools, canRoleUseTool } from "@/features/ai/tools/registry";
import { planAiToolCall, validateAiToolPlan } from "@/features/ai/tools/planner";
import { getLaunchReadinessReport } from "@/features/system/launch-readiness";
import type { AiToolContext } from "@/features/ai/tools/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function tool(name: string) {
  const match = aiTools.find((item) => item.name === name);
  assert(match, `缺少工具：${name}`);
  return match;
}

function context(role: AiToolContext["role"]): AiToolContext {
  return {
    role,
    isStaff: role !== "CONSUMER" && role !== "DEALER",
    user: {
      id: `${role.toLowerCase()}-id`,
      name: role,
      role,
      type: role === "CONSUMER" || role === "DEALER" ? "CUSTOMER" : "STAFF",
    },
  };
}

function main() {
  const names = new Set(aiTools.map((item) => item.name));
  assert(aiTools.length >= 47, "AI tools 数量不足");
  assert(names.size === aiTools.length, "AI tool 名称必须唯一");

  assert(canRoleUseTool("CONSUMER", "customer_submit_order"), "客户应可使用 AI 下单工具");
  assert(!canRoleUseTool("CONSUMER", "business_overview"), "客户不能查看经营总览");
  assert(canRoleUseTool("ADMIN", "admin_update_product_price"), "管理员应可调价");
  assert(canRoleUseTool("ADMIN", "admin_create_customer"), "管理员应可新增客户");
  assert(canRoleUseTool("ADMIN", "customer_purchase_history"), "管理员应可查询客户购买历史");
  assert(canRoleUseTool("SALESPERSON", "customer_purchase_history"), "销售员应可查询名下客户购买历史");
  assert(canRoleUseTool("FINANCE", "customer_purchase_history"), "财务应可查询客户购买历史");
  assert(!canRoleUseTool("WAREHOUSE", "customer_purchase_history"), "仓管不能查询客户购买历史");
  assert(!canRoleUseTool("DEALER", "customer_purchase_history"), "经销商不能查询客户购买历史");
  assert(canRoleUseTool("SALESPERSON", "admin_update_customer_tags"), "销售员应可维护名下客户标签");
  assert(!canRoleUseTool("FINANCE", "admin_create_customer"), "财务不能新增客户");
  assert(canRoleUseTool("ADMIN", "admin_approve_dealer_application"), "管理员应可审核经销商");
  assert(!canRoleUseTool("SALESPERSON", "admin_approve_dealer_application"), "销售员不能审核经销商");
  assert(canRoleUseTool("SALESPERSON", "admin_update_dealer_policy"), "销售员可维护名下经销商政策");
  assert(canRoleUseTool("ADMIN", "marketing_issue_coupon"), "管理员应可确认发券");
  assert(canRoleUseTool("ADMIN", "system_launch_readiness"), "管理员应可检查上线就绪");
  assert(!canRoleUseTool("SALESPERSON", "system_launch_readiness"), "销售员不能查看系统上线配置");
  assert(!canRoleUseTool("SALESPERSON", "settings_create_staff_user"), "销售员不能创建员工");
  assert(canRoleUseTool("WAREHOUSE", "inventory_stock_in"), "仓管应可入库");
  assert(canRoleUseTool("WAREHOUSE", "order_status_action"), "仓管应可处理订单履约");
  assert(!canRoleUseTool("FINANCE", "order_status_action"), "财务不能处理订单状态");
  assert(canRoleUseTool("FINANCE", "finance_register_payment"), "财务应可登记收款");
  assert(canRoleUseTool("DEALER", "dealer_report_stock"), "经销商应可上报库存");

  const orderSchema = tool("customer_submit_order").inputSchema;
  assert(orderSchema.safeParse({ productQuery: "剑兰春", quantity: 1, payMethod: "WECHAT" }).success, "客户下单参数应通过");
  assert(!orderSchema.safeParse({ productQuery: "", quantity: 0 }).success, "缺少商品或数量应校验失败");

  const writeTools = aiTools.filter((item) => item.riskLevel === "WRITE" || item.riskLevel === "HIGH_RISK");
  assert(writeTools.every((item) => typeof item.buildConfirmation === "function"), "写操作必须提供确认卡片");
  assert(aiTools.some((item) => item.riskLevel === "HIGH_RISK"), "应存在高风险工具");
  assert(tool("admin_approve_dealer_application").riskLevel === "HIGH_RISK", "经销商审核应为高风险工具");
  assert(tool("marketing_issue_coupon").riskLevel === "HIGH_RISK", "批量发券应为高风险工具");

  const consumerPlan = planAiToolCall("我要下单 1 箱剑兰春", context("CONSUMER"), aiTools);
  assert(consumerPlan?.toolName === "customer_submit_order", "客户自然语言下单应命中下单工具");
  assert(consumerPlan.args.productQuery === "剑兰春", "客户自然语言下单应清理商品名");

  const consumerSkuPlan = planAiToolCall("我要下单 1 箱 AIFULL-JLC-MOKZNWYX 剑兰春，微信支付", context("CONSUMER"), aiTools);
  assert(consumerSkuPlan?.toolName === "customer_submit_order", "客户带 SKU 和支付方式的自然语言下单应命中下单工具");
  assert(consumerSkuPlan.args.productQuery === "AIFULL-JLC-MOKZNWYX", "客户带 SKU 下单应优先使用 SKU 作为商品查询条件");
  assert(consumerSkuPlan.args.payMethod === "WECHAT", "客户带微信支付下单应提取微信支付方式");

  const consumerTransferPlan = planAiToolCall("我要下单 2 箱剑兰春，转账支付", context("CONSUMER"), aiTools);
  assert(consumerTransferPlan?.toolName === "customer_submit_order", "客户带转账支付的自然语言下单应命中下单工具");
  assert(consumerTransferPlan.args.productQuery === "剑兰春", "客户带支付方式下单不应把支付词拼进商品名");
  assert(consumerTransferPlan.args.payMethod === "TRANSFER", "客户带转账支付下单应提取转账支付方式");

  const staffOrderPlan = planAiToolCall("我要下单 1 箱剑兰春", context("ADMIN"), aiTools);
  assert(staffOrderPlan?.toolName === "orders_manual_order_draft", "员工侧下单意图应进入后台开单草稿，不能误命中经营总览");

  const purchaseHistoryPlan = planAiToolCall("leige买了什么东西?", context("ADMIN"), aiTools);
  assert(purchaseHistoryPlan?.toolName === "customer_purchase_history", "客户买了什么应命中购买历史，不能误命中后台开单草稿");
  assert(purchaseHistoryPlan.args.customerQuery === "leige", "购买历史应提取客户名称");

  const vaguePurchasePlan = planAiToolCall("leige买东西", context("ADMIN"), aiTools);
  assert(vaguePurchasePlan?.toolName !== "orders_manual_order_draft", "含糊第三人称买东西不应直接生成后台开单草稿");

  const correctedStaffOrderPlan = validateAiToolPlan("我要下单 1 箱剑兰春", context("ADMIN"), aiTools, {
    toolName: "business_overview",
    args: { period: "month" },
    reason: "模拟错误模型规划",
  });
  assert(correctedStaffOrderPlan?.toolName === "orders_manual_order_draft", "下单意图若被 AI 误规划为经营总览，应被计划校验层纠偏");

  const correctedPurchaseHistoryPlan = validateAiToolPlan("leige买了什么东西?", context("ADMIN"), aiTools, {
    toolName: "business_overview",
    args: { period: "month" },
    reason: "模拟错误模型规划",
  });
  assert(correctedPurchaseHistoryPlan?.toolName === "customer_purchase_history", "购买历史意图若被 AI 误规划为经营总览，应被计划校验层纠偏");

  const adminPlan = planAiToolCall("这个月张军业绩怎么样", context("ADMIN"), aiTools);
  assert(adminPlan?.toolName === "salesperson_performance", "管理员查询业绩应命中销售员业绩工具");

  const conversionPlan = planAiToolCall("李明最近转化怎么样", context("ADMIN"), aiTools);
  assert(conversionPlan?.toolName === "salesperson_performance", "销售转化类问题应命中销售员业绩工具");
  assert(conversionPlan.args.salespersonName === "李明", "销售转化类问题应提取销售员姓名");
  assert(rankAiToolsForMessage("李明最近转化怎么样", context("ADMIN"), aiTools)[0]?.tool.name === "salesperson_performance", "Planner v2 工具排序应把销售员业绩排在转化问题首位");

  const pricePlan = planAiToolCall("把剑兰春涨价 5 块", context("ADMIN"), aiTools);
  assert(pricePlan?.toolName === "admin_update_product_price", "管理员调价应命中调价工具");
  assert(pricePlan.args.adjustRetailPrice === 5, "相对涨价应提取调价金额");

  const absolutePricePlan = planAiToolCall("把剑兰春价格改成 16", context("ADMIN"), aiTools);
  assert(absolutePricePlan?.toolName === "admin_update_product_price", "管理员绝对改价应命中调价工具");
  assert(absolutePricePlan.args.newRetailPrice === 16, "绝对改价应提取新零售价");

  const productStatusPlan = planAiToolCall("把青岛经典啤酒下架", context("ADMIN"), aiTools);
  assert(productStatusPlan?.toolName === "admin_update_product_status", "商品下架应命中商品上下架工具");
  assert(productStatusPlan.args.status === "INACTIVE", "商品下架应提取 INACTIVE 状态");

  const orderTool = tool("order_status_action");
  type DynamicInput = Parameters<NonNullable<typeof orderTool.resolvePermission>>[0];
  assert(orderTool.resolvePermission?.({ action: "ship" } as DynamicInput, context("WAREHOUSE")) === "orders:fulfill", "发货应要求履约权限");
  assert(orderTool.resolvePermission?.({ action: "cancel" } as DynamicInput, context("ADMIN")) === "orders:write", "取消应要求订单写权限");

  const warehouseTools = aiTools.filter((item) => canRoleUseTool("WAREHOUSE", item.name));
  const blockedWarehousePlan = planAiToolCall("这个月张军业绩怎么样", context("WAREHOUSE"), warehouseTools);
  assert(blockedWarehousePlan?.toolName !== "salesperson_performance", "仓管不应被启发式规划到销售员业绩工具");

  const inventoryRankingPlan = planAiToolCall("现在库存有多少商品，哪个库存最多?", context("ADMIN"), aiTools);
  assert(inventoryRankingPlan?.toolName === "product_operations_summary", "库存数量和库存最多应命中商品经营查询");
  assert(inventoryRankingPlan.args.query === "", "库存总览问题不应把整句当作商品名过滤");
  assert(inventoryRankingPlan.args.sort === "stock_desc", "库存最多问题应按库存倒序查询");
  assert(rankAiToolsForMessage("现在库存有多少商品，哪个库存最多?", context("ADMIN"), aiTools)[0]?.tool.name === "product_operations_summary", "Planner v2 工具排序应把库存总览排在商品经营首位");

  const lowStockPlan = planAiToolCall("哪些商品快没货了", context("ADMIN"), aiTools);
  assert(lowStockPlan?.toolName === "product_operations_summary", "低库存问题应命中商品经营查询");
  assert(lowStockPlan.args.sort === "stock_asc", "低库存问题应按库存升序查询");

  const correctedInventoryRankingPlan = validateAiToolPlan("现在库存有多少商品，哪个库存最多?", context("ADMIN"), aiTools, {
    toolName: "dealer_report_stock",
    args: { productQuery: "青岛经典啤酒", stock: 9 },
    reason: "模拟错误模型规划",
  });
  assert(correctedInventoryRankingPlan?.toolName === "product_operations_summary", "库存总览若被误规划为库存上报，应被纠偏为商品经营查询");
  assert(correctedInventoryRankingPlan.args.sort === "stock_desc", "纠偏后的库存总览应保留库存倒序");

  const stockInPlan = planAiToolCall("给香脆薯片组合装入库 2 件", context("WAREHOUSE"), warehouseTools);
  assert(stockInPlan?.toolName === "inventory_stock_in", "仓管自然语言入库应命中入库工具");
  assert(stockInPlan.args.productQuery === "香脆薯片组合装", "入库商品名应清理动作词");
  assert(stockInPlan.args.quantity === 2, "入库数量应被提取");

  const skuStockInPlan = planAiToolCall("给 SKU AIFULL-STK-MOKZNWYX 入库 1 件，备注 浏览器回归", context("WAREHOUSE"), warehouseTools);
  assert(skuStockInPlan?.toolName === "inventory_stock_in", "仓管 SKU 入库应命中入库工具");
  assert(skuStockInPlan.args.productQuery === "AIFULL-STK-MOKZNWYX", "SKU 入库应优先使用 SKU 作为商品查询条件");
  assert(skuStockInPlan.args.quantity === 1, "SKU 入库应提取最后的业务数量");
  assert(skuStockInPlan.args.remark === "浏览器回归", "SKU 入库应提取备注");

  const financeTools = aiTools.filter((item) => canRoleUseTool("FINANCE", item.name));
  const debtRankingPlan = planAiToolCall("谁欠款最多?", context("FINANCE"), financeTools);
  assert(debtRankingPlan?.toolName === "finance_summary", "欠款排行问题应命中财务摘要工具");
  assert(rankAiToolsForMessage("谁欠款最多?", context("FINANCE"), financeTools)[0]?.tool.name === "finance_summary", "Planner v2 工具排序应把欠款问题排在财务摘要首位");
  const correctedDebtPlan = validateAiToolPlan("谁欠款最多?", context("FINANCE"), financeTools, {
    toolName: "search_customers",
    args: { query: "欠款", limit: 8 },
    reason: "模拟错误模型规划",
  });
  assert(correctedDebtPlan?.toolName === "finance_summary", "欠款排行若被误规划为客户查询，应被纠偏为财务摘要");

  const paymentPlan = planAiToolCall("给13900139001的订单HQAI-FIN-15348961登记收款1元", context("FINANCE"), financeTools);
  assert(paymentPlan?.toolName === "finance_register_payment", "财务自然语言收款应命中登记收款工具");
  assert(paymentPlan.args.customerQuery === "13900139001", "财务收款应提取客户手机号");
  assert(paymentPlan.args.orderNo === "HQAI-FIN-15348961", "财务收款应提取订单号");
  assert(paymentPlan.args.amount === 1, "财务收款应提取金额");

  const orderOnlyPaymentPlan = planAiToolCall("给订单 HQAI-FIN-15348961 登记收款 1 元", context("FINANCE"), financeTools);
  assert(orderOnlyPaymentPlan?.toolName === "finance_register_payment", "财务只提供订单号时也应命中登记收款工具");
  assert(!("customerQuery" in orderOnlyPaymentPlan.args), "只提供订单号时不应生成空客户查询条件");
  assert(orderOnlyPaymentPlan.args.orderNo === "HQAI-FIN-15348961", "财务只提供订单号时应提取订单号");
  assert(orderOnlyPaymentPlan.args.amount === 1, "财务只提供订单号时应提取金额");

  const invoicePlan = planAiToolCall("给订单 HQBROWSERINV166053 开普票，购方 浏览器测试公司，税号 91430000BROWSERTEST", context("FINANCE"), financeTools);
  assert(invoicePlan?.toolName === "receipts_issue_invoice", "财务开票话术应命中开票工具，不能误命中经营总览");
  assert(invoicePlan.args.orderNo === "HQBROWSERINV166053", "财务开票应提取订单号");
  assert(invoicePlan.args.type === "NORMAL", "开普票应提取 NORMAL 类型");
  assert(invoicePlan.args.buyerName === "浏览器测试公司", "财务开票应提取购方名称");
  assert(invoicePlan.args.buyerTaxNo === "91430000BROWSERTEST", "财务开票应提取税号");

  const correctedInvoicePlan = validateAiToolPlan("给订单 HQBROWSERINV166053 开普票，购方 浏览器测试公司", context("FINANCE"), financeTools, {
    toolName: "business_overview",
    args: { period: "month" },
    reason: "模拟错误模型规划",
  });
  assert(correctedInvoicePlan?.toolName === "receipts_issue_invoice", "开票意图若被 AI 误规划为经营总览，应被计划校验层纠偏");

  const readinessPlan = planAiToolCall("现在上线还差什么配置", context("ADMIN"), aiTools);
  assert(readinessPlan?.toolName === "system_launch_readiness", "管理员应可自然语言触发上线就绪检查");

  const salespersonTools = aiTools.filter((item) => canRoleUseTool("SALESPERSON", item.name));
  const productPushPlan = planAiToolCall("把新品 SKU AIFULL-PUSH-MOKZNWYX 推送给 高价值 人群，话术 新品试饮可咨询", context("SALESPERSON"), salespersonTools);
  assert(productPushPlan?.toolName === "marketing_create_product_push", "销售员新品推送写操作应命中新品推送工具，不能误命中渠道摘要");
  assert(productPushPlan.args.productQuery === "AIFULL-PUSH-MOKZNWYX", "新品推送应优先使用 SKU 作为商品查询条件");
  assert(productPushPlan.args.targetTag === "高价值", "新品推送应提取目标人群标签");
  assert(productPushPlan.args.message === "新品试饮可咨询", "新品推送应提取推送话术");

  const correctedProductPushPlan = validateAiToolPlan("把新品 SKU AIFULL-PUSH-MOKZNWYX 推送给 高价值 人群", context("SALESPERSON"), salespersonTools, {
    toolName: "channel_summary",
    args: {},
    reason: "模拟错误模型规划",
  });
  assert(correctedProductPushPlan?.toolName === "marketing_create_product_push", "新品推送意图若被 AI 误规划为渠道摘要，应被计划校验层纠偏");

  const staffDisablePlan = planAiToolCall("禁用员工 13900139088", context("ADMIN"), aiTools);
  assert(staffDisablePlan?.toolName === "settings_set_staff_status", "管理员禁用员工应命中员工状态工具");
  assert(staffDisablePlan.args.userQuery === "13900139088", "禁用员工应提取员工手机号");
  assert(staffDisablePlan.args.isActive === false, "禁用员工应设置目标状态为禁用");

  const staffEnablePlan = planAiToolCall("启用员工 13900139088", context("ADMIN"), aiTools);
  assert(staffEnablePlan?.toolName === "settings_set_staff_status", "管理员启用员工应命中员工状态工具");
  assert(staffEnablePlan.args.isActive === true, "启用员工应设置目标状态为启用");

  const staffResetPlan = planAiToolCall("重置员工 13900139088 密码为 AiFull456", context("ADMIN"), aiTools);
  assert(staffResetPlan?.toolName === "settings_reset_staff_password", "管理员重置员工密码应命中重置密码工具");
  assert(staffResetPlan.args.userQuery === "13900139088", "重置密码应提取员工手机号");
  assert(staffResetPlan.args.password === "AiFull456", "重置密码应提取新密码");

  const correctedStaffStatusPlan = validateAiToolPlan("禁用员工 13900139088", context("ADMIN"), aiTools, {
    toolName: "business_overview",
    args: { period: "month" },
    reason: "模拟错误模型规划",
  });
  assert(correctedStaffStatusPlan?.toolName === "settings_set_staff_status", "员工禁用意图若被 AI 误规划为经营总览，应被计划校验层纠偏");

  const salespersonReadinessPlan = planAiToolCall("现在上线还差什么配置", context("SALESPERSON"), salespersonTools);
  assert(salespersonReadinessPlan?.toolName === "system_launch_readiness", "销售员询问上线配置应进入权限拦截，而不是误规划到经营总览");

  const dealerTools = aiTools.filter((item) => canRoleUseTool("DEALER", item.name));
  const dealerOrderPlan = planAiToolCall("我要下单 1 箱剑兰春", context("DEALER"), dealerTools);
  assert(dealerOrderPlan?.toolName === "search_products", "经销商侧下单意图应先进入商品查询，不能误命中经营总览");
  assert(dealerOrderPlan.args.query === "剑兰春", "经销商侧下单意图应清理商品名");

  const dealerSkuOrderPlan = planAiToolCall("我要下单 1 箱 AIFULL-JLC-MOKZNWYX 剑兰春，微信支付", context("DEALER"), dealerTools);
  assert(dealerSkuOrderPlan?.toolName === "search_products", "经销商侧带 SKU 和支付方式的下单意图应先进入商品查询");
  assert(dealerSkuOrderPlan.args.query === "AIFULL-JLC-MOKZNWYX", "经销商侧带 SKU 下单意图应优先用 SKU 查询商品");

  const correctedDealerOrderPlan = validateAiToolPlan("我要下单 1 箱剑兰春", context("DEALER"), dealerTools, {
    toolName: "dealer_settlement_summary",
    args: {},
    reason: "模拟错误模型规划",
  });
  assert(correctedDealerOrderPlan?.toolName === "search_products", "经销商下单意图若被 AI 误规划为结算查询，应被计划校验层纠偏");

  const dealerStockPlan = planAiToolCall("把青岛经典啤酒门店库存上报为9", context("DEALER"), dealerTools);
  assert(dealerStockPlan?.toolName === "dealer_report_stock", "经销商库存上报应命中库存上报工具");
  assert(dealerStockPlan.args.productQuery === "青岛经典啤酒", "经销商库存上报应清理商品名");
  assert(dealerStockPlan.args.stock === 9, "经销商库存上报应提取库存数");

  const dealerSkuStockPlan = planAiToolCall("上报 HQ-BEER-001 门店库存 9 件", context("DEALER"), dealerTools);
  assert(dealerSkuStockPlan?.toolName === "dealer_report_stock", "经销商 SKU 库存上报应命中库存上报工具");
  assert(dealerSkuStockPlan.args.productQuery === "HQ-BEER-001", "经销商 SKU 库存上报应保留 SKU");
  assert(dealerSkuStockPlan.args.stock === 9, "经销商 SKU 库存上报应提取最后的库存数");

  const dealerAcceptPlan = planAiToolCall("接单 HQ20260430000007", context("DEALER"), dealerTools);
  assert(dealerAcceptPlan?.toolName === "dealer_accept_routing", "经销商接单应命中接单工具");
  assert(dealerAcceptPlan.args.routingId === "HQ20260430000007", "经销商接单应支持订单号作为确认入口");

  const dealerRejectReasonPlan = planAiToolCall("拒单 HQ20260430000008 原因 太远", context("DEALER"), dealerTools);
  assert(dealerRejectReasonPlan?.toolName === "dealer_reject_routing", "经销商拒单应命中拒单工具");
  assert(dealerRejectReasonPlan.args.routingId === "HQ20260430000008", "经销商拒单应支持订单号作为确认入口");
  assert(dealerRejectReasonPlan.args.reason === "太远", "经销商拒单原因应清理原因前缀");

  const consumerSearchPlan = planAiToolCall("查一下青岛经典啤酒", context("CONSUMER"), aiTools);
  assert(consumerSearchPlan?.toolName === "search_products", "消费者商品查询应命中商品查询工具");
  assert(consumerSearchPlan.args.query === "青岛经典啤酒", "消费者商品查询应清理查询前缀");

  const redacted = redactAiAuditValue({ password: "secret", nested: { confirmationToken: "abc", name: "张三" } }) as {
    password?: string;
    nested: { confirmationToken?: string; name: string };
  };
  assert(!("password" in redacted), "审计日志应移除密码字段");
  assert(!("confirmationToken" in redacted.nested), "审计日志应移除确认凭证字段");
  assert(redacted.nested.name === "张三", "审计日志不应误删普通字段");
  const redactedText = redactAiAuditText("创建员工账号 浏览器越权员工 手机号 13933138999 角色 WAREHOUSE 密码 AiFull123，并输入 确认执行");
  assert(!redactedText.includes("AiFull123"), "审计日志自由文本应脱敏密码值");
  assert(!redactedText.includes("确认执行"), "审计日志自由文本应脱敏高风险确认文字");

  const readiness = getLaunchReadinessReport({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
    AUTH_SECRET: "real-secret",
    NEXT_PUBLIC_APP_URL: "https://shop.example.com",
    AI_BASE_URL: "https://ai.example.com/v1",
    AI_API_KEY: "sk-real",
    NEXT_PUBLIC_AMAP_KEY: "amap-key",
    NEXT_PUBLIC_AMAP_SECURITY_CODE: "amap-security",
    WECHAT_MINI_APP_ID: "wx-mini",
    WECHAT_MINI_APP_SECRET: "mini-secret",
    WECHAT_OFFICIAL_APP_ID: "wx-official",
    WECHAT_OFFICIAL_APP_SECRET: "official-secret",
    WECHAT_OFFICIAL_ORDER_TEMPLATE_ID: "template-id",
    WECHAT_PAY_MCH_ID: "mch",
    WECHAT_PAY_SERIAL_NO: "serial",
    WECHAT_PAY_PRIVATE_KEY: "private-key",
    WECHAT_PAY_APIV3_KEY: "apiv3-key",
    WECHAT_PAY_NOTIFY_URL: "https://shop.example.com/api/wechat/pay/notify",
    TAX_PROVIDER: "TAX_API",
    TAX_API_BASE_URL: "https://tax.example.com",
    TAX_API_KEY: "tax-key",
    ALCOHOL_BUSINESS_LICENSE_NO: "license-no",
  });
  assert(readiness.status === "READY", "完整配置应通过上线就绪检查");

  console.log(`AI tools smoke passed: ${aiTools.length} tools`);
}

main();
