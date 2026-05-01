import { preflightAiTool } from "@/features/ai/tools/executor";
import { prisma } from "@/lib/prisma";
import type { AiToolContext, AiToolDefinition, AiToolPlan, AiToolRiskLevel } from "@/features/ai/tools/types";

export type AiQuickPrompt = {
  id: string;
  label: string;
  text: string;
  toolName: string;
  riskLevel: AiToolRiskLevel;
  verified?: true;
};

function getTool(tools: readonly AiToolDefinition[], name: string) {
  return tools.find((tool) => tool.name === name) ?? null;
}

export function normalizeAiPrompt(message: string) {
  return message
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, "");
}

type AiQuickPromptCandidate = AiQuickPrompt & {
  args: Record<string, unknown>;
};

function promptCandidate(input: AiQuickPromptCandidate): AiQuickPromptCandidate {
  return input;
}

async function getFeaturedProduct() {
  return prisma.product.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, sku: true },
    orderBy: [{ salesCount: "desc" }, { stock: "desc" }, { createdAt: "asc" }],
  });
}

async function getFeaturedSalesperson(context: AiToolContext) {
  if (context.role === "SALESPERSON") {
    return prisma.user.findUnique({
      where: { id: context.user.id },
      select: { id: true, name: true, phone: true },
    });
  }

  return prisma.user.findFirst({
    where: { role: "SALESPERSON", isActive: true },
    select: { id: true, name: true, phone: true },
    orderBy: { createdAt: "asc" },
  });
}

async function getDealerPendingRouting(context: AiToolContext) {
  if (context.role !== "DEALER") return null;
  return prisma.orderRouting.findFirst({
    where: { dealer: { customerId: context.user.id }, status: "PENDING" },
    include: { order: { select: { orderNo: true } } },
    orderBy: { assignedAt: "asc" },
  });
}

async function buildQuickPromptCandidates(context: AiToolContext): Promise<AiQuickPromptCandidate[]> {
  const [product, salesperson, pendingRouting] = await Promise.all([
    getFeaturedProduct(),
    context.role === "ADMIN" || context.role === "SALESPERSON" ? getFeaturedSalesperson(context) : Promise.resolve(null),
    getDealerPendingRouting(context),
  ]);
  const productQuery = product?.name ?? "";
  const candidates: AiQuickPromptCandidate[] = [];

  if (context.role === "CONSUMER") {
    if (product) {
      candidates.push(
        promptCandidate({
          id: "consumer-product-search",
          label: "查价格库存",
          text: `查一下${product.name}价格库存`,
          toolName: "search_products",
          riskLevel: "READ",
          args: { query: productQuery, limit: 5 },
        }),
        promptCandidate({
          id: "consumer-order",
          label: "下单确认",
          text: `我要下单 1 箱${product.name}`,
          toolName: "customer_submit_order",
          riskLevel: "WRITE",
          args: { productQuery, quantity: 1, payMethod: "WECHAT" },
        }),
      );
    }
    candidates.push(
      promptCandidate({
        id: "consumer-orders",
        label: "我的订单",
        text: "查看我的最近订单",
        toolName: "customer_orders",
        riskLevel: "READ",
        args: { limit: 5 },
      }),
      promptCandidate({
        id: "consumer-receivables",
        label: "待付款",
        text: "我有哪些待付款",
        toolName: "customer_receivables",
        riskLevel: "READ",
        args: {},
      }),
    );
  }

  if (context.role === "DEALER") {
    candidates.push(
      promptCandidate({
        id: "dealer-incoming",
        label: "待接订单",
        text: "查一下我的待接订单",
        toolName: "dealer_incoming_orders",
        riskLevel: "READ",
        args: {},
      }),
      promptCandidate({
        id: "dealer-settlement",
        label: "结算摘要",
        text: "本月结算摘要",
        toolName: "dealer_settlement_summary",
        riskLevel: "READ",
        args: {},
      }),
    );
    if (product) {
      candidates.push(
        promptCandidate({
          id: "dealer-stock",
          label: "上报库存",
          text: `把${product.name}门店库存上报为 9`,
          toolName: "dealer_report_stock",
          riskLevel: "WRITE",
          args: { productQuery, stock: 9 },
        }),
        promptCandidate({
          id: "dealer-product-search",
          label: "查商品",
          text: `查一下${product.name}价格库存`,
          toolName: "search_products",
          riskLevel: "READ",
          args: { query: productQuery, limit: 5 },
        }),
      );
    }
    if (pendingRouting?.order.orderNo) {
      candidates.push(
        promptCandidate({
          id: "dealer-accept-routing",
          label: "确认接单",
          text: `接单 ${pendingRouting.order.orderNo}`,
          toolName: "dealer_accept_routing",
          riskLevel: "WRITE",
          args: { routingId: pendingRouting.order.orderNo },
        }),
      );
    }
  }

  if (context.role === "ADMIN") {
    candidates.push(
      promptCandidate({
        id: "admin-overview",
        label: "经营总览",
        text: "这个月经营总览怎么样",
        toolName: "business_overview",
        riskLevel: "READ",
        args: { period: "month" },
      }),
      promptCandidate({
        id: "admin-readiness",
        label: "上线检查",
        text: "现在上线还差什么配置",
        toolName: "system_launch_readiness",
        riskLevel: "READ",
        args: {},
      }),
      promptCandidate({
        id: "admin-customer-search",
        label: "客户欠款",
        text: "查客户欠款和最近订单",
        toolName: "search_customers",
        riskLevel: "READ",
        args: { query: "", limit: 8 },
      }),
    );
    if (salesperson) {
      candidates.push(
        promptCandidate({
          id: "admin-sales-performance",
          label: "销售业绩",
          text: `这个月${salesperson.name}业绩怎么样`,
          toolName: "salesperson_performance",
          riskLevel: "READ",
          args: { salespersonName: salesperson.name, period: "month" },
        }),
      );
    }
    if (product) {
      candidates.push(
        promptCandidate({
          id: "admin-price",
          label: "商品调价",
          text: `把${product.name}涨价 5 块`,
          toolName: "admin_update_product_price",
          riskLevel: "WRITE",
          args: { productQuery, adjustRetailPrice: 5 },
        }),
      );
    }
  }

  if (context.role === "SALESPERSON") {
    candidates.push(
      promptCandidate({
        id: "sales-performance",
        label: "我的业绩",
        text: "这个月我的业绩怎么样",
        toolName: "salesperson_performance",
        riskLevel: "READ",
        args: { period: "month" },
      }),
      promptCandidate({
        id: "sales-customers",
        label: "客户欠款",
        text: "查客户欠款和最近订单",
        toolName: "search_customers",
        riskLevel: "READ",
        args: { query: "", limit: 8 },
      }),
    );
    if (product) {
      candidates.push(
        promptCandidate({
          id: "sales-product-push-draft",
          label: "推送草稿",
          text: `生成新品推送草稿，把${product.name}发给高价值客户`,
          toolName: "marketing_product_push_draft",
          riskLevel: "DRAFT",
          args: { text: `生成新品推送草稿，把${product.name}发给高价值客户` },
        }),
      );
    }
  }

  if (context.role === "WAREHOUSE") {
    candidates.push(
      promptCandidate({
        id: "warehouse-delivery",
        label: "配送摘要",
        text: "查看配送摘要",
        toolName: "delivery_summary",
        riskLevel: "READ",
        args: {},
      }),
      promptCandidate({
        id: "warehouse-stock",
        label: "库存预警",
        text: "查看商品库存和预警",
        toolName: "product_operations_summary",
        riskLevel: "READ",
        args: { query: "", limit: 8 },
      }),
      promptCandidate({
        id: "warehouse-stock-check",
        label: "新建盘点",
        text: "新建一张全量盘点任务",
        toolName: "warehouse_create_stock_check",
        riskLevel: "WRITE",
        args: {},
      }),
    );
    if (product) {
      candidates.push(
        promptCandidate({
          id: "warehouse-stock-in",
          label: "商品入库",
          text: `给${product.name}入库 2 件`,
          toolName: "inventory_stock_in",
          riskLevel: "WRITE",
          args: { productQuery, quantity: 2, remark: "AI助手操作" },
        }),
      );
    }
  }

  if (context.role === "FINANCE") {
    candidates.push(
      promptCandidate({
        id: "finance-summary",
        label: "财务摘要",
        text: "这个月财务应收和回款",
        toolName: "finance_summary",
        riskLevel: "READ",
        args: { period: "month" },
      }),
      promptCandidate({
        id: "finance-debt-ranking",
        label: "欠款客户",
        text: "查看客户欠款排行",
        toolName: "finance_summary",
        riskLevel: "READ",
        args: { period: "month" },
      }),
    );
  }

  return candidates;
}

async function verifyQuickPrompt(candidate: AiQuickPromptCandidate, context: AiToolContext, tools: readonly AiToolDefinition[]) {
  const tool = getTool(tools, candidate.toolName);
  if (!tool) return null;
  try {
    await preflightAiTool(tool, candidate.args, context);
    return {
      id: candidate.id,
      label: candidate.label,
      text: candidate.text,
      toolName: candidate.toolName,
      riskLevel: candidate.riskLevel,
      verified: true as const,
    };
  } catch {
    return null;
  }
}

export async function getVerifiedQuickPrompts(context: AiToolContext, tools: readonly AiToolDefinition[]) {
  const candidates = await buildQuickPromptCandidates(context);
  const verified = await Promise.all(candidates.map((candidate) => verifyQuickPrompt(candidate, context, tools)));
  return verified.filter((prompt): prompt is AiQuickPrompt & { verified: true } => Boolean(prompt));
}

export async function planVerifiedQuickPrompt(quickPromptId: string, context: AiToolContext, tools: readonly AiToolDefinition[]): Promise<AiToolPlan | null> {
  const candidates = await buildQuickPromptCandidates(context);
  const candidate = candidates.find((item) => item.id === quickPromptId);
  if (!candidate) return null;
  const tool = getTool(tools, candidate.toolName);
  if (!tool) return null;
  try {
    await preflightAiTool(tool, candidate.args, context);
    return {
      toolName: candidate.toolName,
      args: candidate.args,
      reason: `已验证固定词条：${candidate.label}`,
    };
  } catch {
    return null;
  }
}
