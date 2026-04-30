import { redactAiAuditValue } from "@/features/ai/tools/audit";
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

  const staffOrderPlan = planAiToolCall("我要下单 1 箱剑兰春", context("ADMIN"), aiTools);
  assert(staffOrderPlan?.toolName === "orders_manual_order_draft", "员工侧下单意图应进入后台开单草稿，不能误命中经营总览");

  const correctedStaffOrderPlan = validateAiToolPlan("我要下单 1 箱剑兰春", context("ADMIN"), aiTools, {
    toolName: "business_overview",
    args: { period: "month" },
    reason: "模拟错误模型规划",
  });
  assert(correctedStaffOrderPlan?.toolName === "orders_manual_order_draft", "下单意图若被 AI 误规划为经营总览，应被计划校验层纠偏");

  const adminPlan = planAiToolCall("这个月张军业绩怎么样", context("ADMIN"), aiTools);
  assert(adminPlan?.toolName === "salesperson_performance", "管理员查询业绩应命中销售员业绩工具");

  const pricePlan = planAiToolCall("把剑兰春涨价 5 块", context("ADMIN"), aiTools);
  assert(pricePlan?.toolName === "admin_update_product_price", "管理员调价应命中调价工具");
  assert(pricePlan.args.adjustRetailPrice === 5, "相对涨价应提取调价金额");

  const absolutePricePlan = planAiToolCall("把剑兰春价格改成 16", context("ADMIN"), aiTools);
  assert(absolutePricePlan?.toolName === "admin_update_product_price", "管理员绝对改价应命中调价工具");
  assert(absolutePricePlan.args.newRetailPrice === 16, "绝对改价应提取新零售价");

  const orderTool = tool("order_status_action");
  type DynamicInput = Parameters<NonNullable<typeof orderTool.resolvePermission>>[0];
  assert(orderTool.resolvePermission?.({ action: "ship" } as DynamicInput, context("WAREHOUSE")) === "orders:fulfill", "发货应要求履约权限");
  assert(orderTool.resolvePermission?.({ action: "cancel" } as DynamicInput, context("ADMIN")) === "orders:write", "取消应要求订单写权限");

  const warehouseTools = aiTools.filter((item) => canRoleUseTool("WAREHOUSE", item.name));
  const blockedWarehousePlan = planAiToolCall("这个月张军业绩怎么样", context("WAREHOUSE"), warehouseTools);
  assert(blockedWarehousePlan?.toolName !== "salesperson_performance", "仓管不应被启发式规划到销售员业绩工具");

  const stockInPlan = planAiToolCall("给香脆薯片组合装入库 2 件", context("WAREHOUSE"), warehouseTools);
  assert(stockInPlan?.toolName === "inventory_stock_in", "仓管自然语言入库应命中入库工具");
  assert(stockInPlan.args.productQuery === "香脆薯片组合装", "入库商品名应清理动作词");
  assert(stockInPlan.args.quantity === 2, "入库数量应被提取");

  const financeTools = aiTools.filter((item) => canRoleUseTool("FINANCE", item.name));
  const paymentPlan = planAiToolCall("给13900139001的订单HQAI-FIN-15348961登记收款1元", context("FINANCE"), financeTools);
  assert(paymentPlan?.toolName === "finance_register_payment", "财务自然语言收款应命中登记收款工具");
  assert(paymentPlan.args.customerQuery === "13900139001", "财务收款应提取客户手机号");
  assert(paymentPlan.args.orderNo === "HQAI-FIN-15348961", "财务收款应提取订单号");
  assert(paymentPlan.args.amount === 1, "财务收款应提取金额");

  const readinessPlan = planAiToolCall("现在上线还差什么配置", context("ADMIN"), aiTools);
  assert(readinessPlan?.toolName === "system_launch_readiness", "管理员应可自然语言触发上线就绪检查");

  const salespersonTools = aiTools.filter((item) => canRoleUseTool("SALESPERSON", item.name));
  const salespersonReadinessPlan = planAiToolCall("现在上线还差什么配置", context("SALESPERSON"), salespersonTools);
  assert(salespersonReadinessPlan?.toolName === "system_launch_readiness", "销售员询问上线配置应进入权限拦截，而不是误规划到经营总览");

  const dealerTools = aiTools.filter((item) => canRoleUseTool("DEALER", item.name));
  const dealerOrderPlan = planAiToolCall("我要下单 1 箱剑兰春", context("DEALER"), dealerTools);
  assert(dealerOrderPlan?.toolName === "search_products", "经销商侧下单意图应先进入商品查询，不能误命中经营总览");
  assert(dealerOrderPlan.args.query === "剑兰春", "经销商侧下单意图应清理商品名");

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
