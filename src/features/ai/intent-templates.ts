import type { AppRole } from "@/features/auth/permissions";
import type { AiToolContext, AiToolDefinition, AiToolPlan, AiToolRiskLevel } from "@/features/ai/tools/types";

export type AiQuickPrompt = {
  id: string;
  label: string;
  text: string;
  toolName: string;
  riskLevel: AiToolRiskLevel;
};

type AiIntentTemplate = AiQuickPrompt & {
  roles: readonly AppRole[];
  args: Record<string, unknown>;
  aliases?: readonly string[];
};

const templates: AiIntentTemplate[] = [
  {
    id: "consumer-product-search",
    label: "查商品价格",
    text: "查一下剑兰春价格库存",
    roles: ["CONSUMER"],
    toolName: "search_products",
    riskLevel: "READ",
    args: { query: "剑兰春", limit: 5 },
  },
  {
    id: "consumer-orders",
    label: "我的订单",
    text: "查看我的最近订单",
    roles: ["CONSUMER"],
    toolName: "customer_orders",
    riskLevel: "READ",
    args: { limit: 5 },
  },
  {
    id: "consumer-receivables",
    label: "我的待付款",
    text: "我有哪些待付款",
    roles: ["CONSUMER"],
    toolName: "customer_receivables",
    riskLevel: "READ",
    args: {},
  },
  {
    id: "consumer-order",
    label: "我要下单",
    text: "我要下单 1 箱剑兰春",
    roles: ["CONSUMER"],
    toolName: "customer_submit_order",
    riskLevel: "WRITE",
    args: { productQuery: "剑兰春", quantity: 1, payMethod: "WECHAT" },
  },
  {
    id: "dealer-incoming",
    label: "待接订单",
    text: "查一下我的待接订单",
    roles: ["DEALER"],
    toolName: "dealer_incoming_orders",
    riskLevel: "READ",
    args: {},
  },
  {
    id: "dealer-settlement",
    label: "结算摘要",
    text: "本月结算摘要",
    roles: ["DEALER"],
    toolName: "dealer_settlement_summary",
    riskLevel: "READ",
    args: {},
  },
  {
    id: "dealer-stock",
    label: "上报库存",
    text: "把剑兰春门店库存上报为 9",
    roles: ["DEALER"],
    toolName: "dealer_report_stock",
    riskLevel: "WRITE",
    args: { productQuery: "剑兰春", stock: 9 },
  },
  {
    id: "dealer-product-search",
    label: "查商品",
    text: "查一下剑兰春价格库存",
    roles: ["DEALER"],
    toolName: "search_products",
    riskLevel: "READ",
    args: { query: "剑兰春", limit: 5 },
  },
  {
    id: "admin-overview",
    label: "经营总览",
    text: "这个月经营总览怎么样",
    roles: ["ADMIN"],
    toolName: "business_overview",
    riskLevel: "READ",
    args: { period: "month" },
  },
  {
    id: "admin-readiness",
    label: "上线检查",
    text: "现在上线还差什么配置",
    roles: ["ADMIN"],
    toolName: "system_launch_readiness",
    riskLevel: "READ",
    args: {},
  },
  {
    id: "admin-price",
    label: "商品调价",
    text: "把剑兰春涨价 5 块",
    roles: ["ADMIN"],
    toolName: "admin_update_product_price",
    riskLevel: "WRITE",
    args: { productQuery: "剑兰春", adjustRetailPrice: 5 },
  },
  {
    id: "admin-customer-search",
    label: "客户查询",
    text: "查客户欠款和最近订单",
    roles: ["ADMIN"],
    toolName: "search_customers",
    riskLevel: "READ",
    args: { query: "", limit: 8 },
  },
  {
    id: "sales-performance",
    label: "我的业绩",
    text: "这个月我的业绩怎么样",
    roles: ["SALESPERSON"],
    toolName: "salesperson_performance",
    riskLevel: "READ",
    args: { period: "month" },
  },
  {
    id: "sales-customers",
    label: "客户查询",
    text: "查客户欠款和最近订单",
    roles: ["SALESPERSON"],
    toolName: "search_customers",
    riskLevel: "READ",
    args: { query: "", limit: 8 },
  },
  {
    id: "sales-product-push-draft",
    label: "新品推送草稿",
    text: "生成新品推送草稿，把剑兰春发给高价值客户",
    roles: ["SALESPERSON"],
    toolName: "marketing_product_push_draft",
    riskLevel: "DRAFT",
    args: { text: "生成新品推送草稿，把剑兰春发给高价值客户" },
  },
  {
    id: "warehouse-delivery",
    label: "配送摘要",
    text: "查看配送摘要",
    roles: ["WAREHOUSE"],
    toolName: "delivery_summary",
    riskLevel: "READ",
    args: {},
  },
  {
    id: "warehouse-stock",
    label: "库存预警",
    text: "查看商品库存和预警",
    roles: ["WAREHOUSE"],
    toolName: "product_operations_summary",
    riskLevel: "READ",
    args: { query: "", limit: 8 },
  },
  {
    id: "warehouse-stock-in",
    label: "商品入库",
    text: "给剑兰春入库 2 件",
    roles: ["WAREHOUSE"],
    toolName: "inventory_stock_in",
    riskLevel: "WRITE",
    args: { productQuery: "剑兰春", quantity: 2, remark: "AI助手操作" },
  },
  {
    id: "warehouse-stock-check",
    label: "新建盘点",
    text: "新建一张全量盘点任务",
    roles: ["WAREHOUSE"],
    toolName: "warehouse_create_stock_check",
    riskLevel: "WRITE",
    args: {},
  },
  {
    id: "finance-summary",
    label: "财务摘要",
    text: "这个月财务应收和回款",
    roles: ["FINANCE"],
    toolName: "finance_summary",
    riskLevel: "READ",
    args: { period: "month" },
  },
  {
    id: "finance-debt-ranking",
    label: "欠款客户",
    text: "查看客户欠款排行",
    roles: ["FINANCE"],
    toolName: "finance_summary",
    riskLevel: "READ",
    args: { period: "month" },
  },
];

function hasTool(tools: readonly AiToolDefinition[], name: string) {
  return tools.some((tool) => tool.name === name);
}

export function normalizeAiPrompt(message: string) {
  return message
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, "");
}

function templateMatches(template: AiIntentTemplate, message: string) {
  const normalized = normalizeAiPrompt(message);
  return [template.text, ...(template.aliases ?? [])].some((text) => normalizeAiPrompt(text) === normalized);
}

export function getAiQuickPromptsForContext(context: AiToolContext, tools: readonly AiToolDefinition[]) {
  return templates
    .filter((template) => template.roles.includes(context.role) && hasTool(tools, template.toolName))
    .map<AiQuickPrompt>(({ id, label, text, toolName, riskLevel }) => ({ id, label, text, toolName, riskLevel }));
}

export function planFixedAiToolCall(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  const template = templates.find((item) => item.roles.includes(context.role) && hasTool(tools, item.toolName) && templateMatches(item, message));
  if (!template) return null;
  return {
    toolName: template.toolName,
    args: template.args,
    reason: `固定词条：${template.label}`,
  };
}
