import { callAnthropicCompatible, hasAiProvider } from "@/features/ai/provider";
import {
  describeRankedAgentCapabilitiesForPrompt,
  findBestAgentCapabilityForMessage,
  rankAgentCapabilitiesForMessage,
  type RankedAgentCapability,
} from "@/features/ai/tools/capabilities";
import {
  describeAssistantIntentPolicyForPrompt,
  isNavigationToolName,
  shouldBoostNavigationTools,
  shouldPreferReadTools,
} from "@/features/ai/tools/intent-policy";
import type { AiAssistantCard, AiToolContext, AiToolDefinition, AiToolPlan } from "@/features/ai/tools/types";

export type RankedAiTool = {
  tool: AiToolDefinition;
  score: number;
  reasons: string[];
};

type ModelPlanJson = {
  intent?: unknown;
  toolName?: unknown;
  args?: unknown;
  confidence?: unknown;
  missingSlots?: unknown;
  reason?: unknown;
};

type ModelPlannerResult = {
  plan: AiToolPlan | null;
  rankedTools: RankedAiTool[];
  rankedCapabilities: RankedAgentCapability[];
  missingSlots: string[];
  rawText?: string;
  error?: string;
};

export const AI_PLANNER_CORE_TOOL_LIMIT = 18;
export const AI_PLANNER_EXPANDED_TOOL_LIMIT = 32;
const MIN_MODEL_CONFIDENCE = 0.45;

type ToolCandidateRule = {
  pattern: RegExp;
  toolNames: string[];
  reason: string;
  roles?: AiToolContext["role"][];
};

type DomainRule = {
  pattern: RegExp;
  matchTool: RegExp;
  reason: string;
};

const forcedToolCandidateRules: ToolCandidateRule[] = [
  { pattern: /购物车/, roles: ["ADMIN", "SALESPERSON"], toolNames: ["admin_customer_cart_summary"], reason: "强规则:客户购物车" },
  { pattern: /购物车/, roles: ["CONSUMER"], toolNames: ["shop_cart_summary"], reason: "强规则:我的购物车" },
  { pattern: /优惠券|可用券|券包/, roles: ["ADMIN", "SALESPERSON"], toolNames: ["admin_customer_coupon_summary"], reason: "强规则:客户优惠券" },
  { pattern: /优惠券|可用券|券包/, roles: ["CONSUMER"], toolNames: ["shop_coupon_summary"], reason: "强规则:我的优惠券" },
  { pattern: /待接订单|待接单|新订单/, roles: ["ADMIN", "SALESPERSON"], toolNames: ["admin_dealer_incoming_orders"], reason: "强规则:经销商待接单" },
  { pattern: /待接订单|待接单|新订单/, roles: ["DEALER"], toolNames: ["dealer_incoming_orders"], reason: "强规则:我的待接单" },
  { pattern: /经销商.*(?:结算|佣金|账款)|门店.*(?:结算|佣金|账款)|结算|佣金/, roles: ["ADMIN", "FINANCE"], toolNames: ["admin_dealer_settlement_summary"], reason: "强规则:经销商结算" },
  { pattern: /结算|佣金/, roles: ["DEALER"], toolNames: ["dealer_settlement_summary"], reason: "强规则:我的结算" },
  { pattern: /经销商.*(?:库存|上报库存)|门店.*(?:库存|上报库存)/, roles: ["ADMIN", "SALESPERSON", "WAREHOUSE"], toolNames: ["admin_dealer_stock_summary"], reason: "强规则:经销商库存" },
  { pattern: /上报库存|报库存/, roles: ["DEALER"], toolNames: ["dealer_report_stock"], reason: "强规则:上报库存" },
  { pattern: /推广|推广码|扫码|线索转化/, roles: ["ADMIN", "SALESPERSON"], toolNames: ["admin_dealer_promotion_summary", "channel_pipeline_summary"], reason: "强规则:渠道推广" },
  { pattern: /推广|推广码|扫码|线索转化/, roles: ["DEALER"], toolNames: ["dealer_promotion_summary"], reason: "强规则:我的推广" },
  { pattern: /(?:客户|用户|会员).*(?:账户|账号|资料|地址|积分|概况)|(?:账户|账号|资料|地址|积分|概况).*(?:客户|用户|会员)/, roles: ["ADMIN", "SALESPERSON", "FINANCE"], toolNames: ["admin_customer_account_summary", "search_customers"], reason: "强规则:客户账户" },
  { pattern: /(?:客户|用户|会员).*(?:订单|下单记录|配送状态)|(?:订单|下单记录|配送状态).*(?:客户|用户|会员)/, roles: ["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"], toolNames: ["admin_customer_orders", "order_summary"], reason: "强规则:客户订单" },
  { pattern: /(?:客户|用户|会员).*(?:欠款|待付款|应收|账款|未付款)|(?:欠款|待付款|应收|账款|未付款).*(?:客户|用户|会员)/, roles: ["ADMIN", "SALESPERSON", "FINANCE"], toolNames: ["admin_customer_receivables", "finance_summary"], reason: "强规则:客户应收" },
  { pattern: /最近.*(?:订单|单子)|(?:订单|单子|下单记录).*(?:最近|今天|本月|有哪些|多少|状态)/, toolNames: ["order_summary"], reason: "强规则:订单摘要" },
  { pattern: /(?:客户|用户|会员).*(?:总数|数量|多少|几个|统计|排行)|(?:一共|总共|共有|总计).*(?:客户|用户|会员)/, toolNames: ["customer_analytics_summary"], reason: "强规则:客户统计" },
  { pattern: /(?:库存|商品).*(?:总量|最多|低库存|缺货|预警)|(?:低库存|缺货|预警|库存最多)/, toolNames: ["product_operations_summary"], reason: "强规则:商品库存经营" },
  { pattern: /销售员|业务员|业绩|绩效|转化|销售排名/, toolNames: ["salesperson_performance"], reason: "强规则:销售业绩" },
  { pattern: /配送|发货|送达|物流/, toolNames: ["delivery_summary"], reason: "强规则:配送" },
  { pattern: /财务|应收|欠款|回款|收款|账龄/, toolNames: ["finance_summary", "finance_statement_summary"], reason: "强规则:财务" },
  { pattern: /开票|发票|普票|专票|税号/, toolNames: ["receipts_issue_invoice", "finance_statement_summary"], reason: "强规则:票据" },
  { pattern: /采购|供应商|进货|到货/, toolNames: ["purchase_supplier_summary"], reason: "强规则:采购供应商" },
  { pattern: /微信|公众号|小程序|模板消息|菜单/, toolNames: ["wechat_ecosystem_summary"], reason: "强规则:微信生态" },
  { pattern: /操作日志|审计|AI 日志|谁操作/, toolNames: ["audit_log_summary"], reason: "强规则:日志" },
  { pattern: /运营验收|业务签收|运营接手|真实支付|小程序体验版|备份恢复演练|账号权限复核|价格复核|库存盘点/, toolNames: ["system_operational_acceptance"], reason: "强规则:运营验收检查" },
  { pattern: /完整度|全系统检查|全系统.*完善|系统.*没完善|功能缺口|程序.*没做完|开发.*没完成/, toolNames: ["system_completeness_audit"], reason: "强规则:全系统程序完整度检查" },
  { pattern: /上线|发布|部署|就绪|还差什么/, toolNames: ["system_launch_readiness"], reason: "强规则:上线检查" },
];

const domainCandidateRules: DomainRule[] = [
  { pattern: /订单|单子|下单|支付|配送状态/, matchTool: /order|delivery|customer_orders/, reason: "领域:订单" },
  { pattern: /客户|用户|会员|手机号|标签|地址|欠款|购物车|优惠券/, matchTool: /customer|shop_|finance/, reason: "领域:客户" },
  { pattern: /商品|产品|SKU|价格|售价|库存|品牌|分类|素材/, matchTool: /product|inventory|warehouse|search_products/, reason: "领域:商品库存" },
  { pattern: /经销商|门店|渠道|线索|询价|报价|推广|冲突|待接单|结算|佣金/, matchTool: /dealer|channel|lead|inquiry|quote|promoter/, reason: "领域:渠道经销商" },
  { pattern: /财务|应收|欠款|回款|收款|发票|票据|对账/, matchTool: /finance|receipt|invoice|payment|receivable/, reason: "领域:财务" },
  { pattern: /员工|账号|密码|权限|系统设置|配置/, matchTool: /settings|system/, reason: "领域:设置" },
  { pattern: /微信|公众号|小程序|模板消息|菜单/, matchTool: /wechat/, reason: "领域:微信" },
  { pattern: /在哪|哪里|入口|打开|进入|跳转|页面|菜单|怎么|如何/, matchTool: /navigate_to_feature|feature_help/, reason: "领域:功能导航" },
];

const slotLabelMap: Record<string, string> = {
  productQuery: "商品名或 SKU",
  query: "查询关键词",
  customerQuery: "客户姓名或手机号",
  salespersonName: "销售员姓名",
  salesPersonQuery: "销售员姓名或手机号",
  orderNo: "订单号",
  routingId: "订单号或派单编号",
  amount: "金额",
  quantity: "数量",
  stock: "库存数量",
  reason: "原因",
  targetTag: "目标客户标签",
  buyerName: "购方名称",
  phone: "手机号",
  name: "名称",
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function uniqueStrings(values: Iterable<string | undefined>) {
  return Array.from(new Set(Array.from(values).map((value) => value?.trim()).filter(Boolean) as string[]));
}

function splitSearchTerms(message: string) {
  return uniqueStrings([
    ...message.split(/[\s，。,.！!？?、:：/\\|]+/),
    ...Array.from(message.matchAll(/[A-Za-z0-9-]{3,}/g)).map((match) => match[0]),
    ...Array.from(message.matchAll(/[\u4e00-\u9fa5]{2,6}/g)).map((match) => match[0]),
  ]).filter((term) => term.length >= 2);
}

function scorePhrase(message: string, phrase: string) {
  const normalizedMessage = normalize(message);
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return 0;
  if (normalizedMessage.includes(normalizedPhrase)) return normalizedPhrase.length >= 4 ? 12 : 8;
  if (normalizedPhrase.includes(normalizedMessage) && normalizedMessage.length >= 4) return 6;
  return 0;
}

function scoreTool(message: string, tool: AiToolDefinition, index: number): RankedAiTool {
  const terms = splitSearchTerms(message);
  const reasons: string[] = [];
  let score = Math.max(0, 1 - index / 1000);

  const capabilityScore = (tool.capabilities ?? []).reduce((total, capability) => {
    const value = scorePhrase(message, capability);
    if (value > 0) reasons.push(`能力:${capability}`);
    return total + value;
  }, 0);
  score += capabilityScore * 1.4;

  const exampleScore = (tool.examples ?? []).reduce((total, example) => {
    const value = scorePhrase(message, example);
    if (value > 0) reasons.push(`示例:${example}`);
    return total + value;
  }, 0);
  score += exampleScore * 1.1;

  const semanticText = normalize(
    [tool.name, tool.title, tool.description, ...(tool.capabilities ?? []), ...(tool.examples ?? [])].join(" "),
  );
  for (const term of terms) {
    const normalizedTerm = normalize(term);
    if (normalizedTerm && semanticText.includes(normalizedTerm)) {
      score += normalizedTerm.length >= 4 ? 3 : 1.5;
      if (reasons.length < 4) reasons.push(`关键词:${term}`);
    }
  }

  if (tool.riskLevel === "READ") score += 0.4;
  if (tool.riskLevel === "HIGH_RISK") score -= 0.2;

  return { tool, score, reasons: reasons.slice(0, 4) };
}

function pushReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.unshift(reason);
  return reasons.slice(0, 5);
}

function roleMatchesRule(rule: ToolCandidateRule, role: AiToolContext["role"]) {
  return !rule.roles || rule.roles.includes(role);
}

export function rankAiToolsForMessage(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]) {
  const rankedCapabilities = rankAgentCapabilitiesForMessage(message, context);
  const bestCapability = rankedCapabilities[0];
  const boostNavigation = shouldBoostNavigationTools(message);
  const preferRead = shouldPreferReadTools(message);
  const forcedToolReasons = new Map<string, string[]>();
  if (!boostNavigation) {
    for (const rule of forcedToolCandidateRules) {
      if (!roleMatchesRule(rule, context.role) || !rule.pattern.test(message)) continue;
      for (const toolName of rule.toolNames) {
        forcedToolReasons.set(toolName, [...(forcedToolReasons.get(toolName) ?? []), rule.reason]);
      }
    }
  }
  const matchedDomainRules = domainCandidateRules.filter((rule) => rule.pattern.test(message));
  return tools
    .map((tool, index) => {
      const ranked = scoreTool(message, tool, index);
      const forcedReasons = forcedToolReasons.get(tool.name) ?? [];
      if (forcedReasons.length) {
        ranked.score += 120 + forcedReasons.length * 8;
        ranked.reasons = pushReason(ranked.reasons, forcedReasons.join("、"));
      }
      for (const rule of matchedDomainRules) {
        if (rule.matchTool.test(tool.name)) {
          ranked.score += 14;
          ranked.reasons = pushReason(ranked.reasons, rule.reason);
        }
      }
      if (isNavigationToolName(tool.name) && bestCapability && boostNavigation) {
        const boost = Math.min(bestCapability.score * (tool.name === "navigate_to_feature" ? 1.35 : 1.05), 35);
        ranked.score += boost;
        ranked.reasons = [`功能:${bestCapability.capability.title}`, ...ranked.reasons].slice(0, 4);
      }
      if (preferRead) {
        if (isNavigationToolName(tool.name)) {
          ranked.score -= 50;
          ranked.reasons = ["业务查询不走页面导航", ...ranked.reasons].slice(0, 4);
        } else if (tool.riskLevel === "READ") {
          ranked.score += 2;
        }
      }
      return ranked;
    })
    .sort((left, right) => right.score - left.score);
}

function describeRankedTool(item: RankedAiTool) {
  const { tool } = item;
  const capabilities = tool.capabilities?.length ? `能力=${tool.capabilities.join("、")}` : "";
  const examples = tool.examples?.length ? `示例=${tool.examples.join(" / ")}` : "";
  const argumentHints = tool.argumentHints ? `参数=${tool.argumentHints}` : "参数={}";
  const reasons = item.reasons.length ? `匹配=${item.reasons.join("、")}` : "";
  return `- ${tool.name}｜${tool.title}｜${tool.riskLevel}｜${tool.description}｜${capabilities}｜${examples}｜${argumentHints}｜${reasons}`;
}

export function describeRankedAiToolsForPrompt(rankedTools: readonly RankedAiTool[], limit = AI_PLANNER_CORE_TOOL_LIMIT) {
  return rankedTools.slice(0, limit).map(describeRankedTool).join("\n");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ModelPlanJson;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asPlan(parsed: ModelPlanJson, rankedTools: readonly RankedAiTool[]) {
  const toolName = typeof parsed.toolName === "string" ? parsed.toolName.trim() : "";
  const confidence = Number(parsed.confidence ?? (toolName ? 0.8 : 0));
  const missingSlots = asStringArray(parsed.missingSlots);
  const knownTool = rankedTools.some((item) => item.tool.name === toolName);

  if (!toolName || !knownTool || missingSlots.length > 0 || !Number.isFinite(confidence) || confidence < MIN_MODEL_CONFIDENCE) {
    return { plan: null, missingSlots, confidence };
  }

  const plan: AiToolPlan = {
    toolName,
    args: asRecord(parsed.args),
    reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "模型规划",
    intent: typeof parsed.intent === "string" ? parsed.intent.trim() : undefined,
    confidence,
    missingSlots,
  };
  return { plan, missingSlots, confidence };
}

async function callModelPlanner(params: {
  message: string;
  context: AiToolContext;
  rankedTools: readonly RankedAiTool[];
  toolLimit?: number;
  repair?: { rejectedPlan: AiToolPlan | null; error: string };
}) {
  const toolLimit = params.toolLimit ?? AI_PLANNER_CORE_TOOL_LIMIT;
  const toolsText = describeRankedAiToolsForPrompt(params.rankedTools, toolLimit);
  const toolNames = params.rankedTools.slice(0, toolLimit).map((item) => item.tool.name).join(", ");
  const rankedCapabilities = rankAgentCapabilitiesForMessage(params.message, params.context);
  const capabilitiesText = describeRankedAgentCapabilitiesForPrompt(rankedCapabilities);
  const repairText = params.repair
    ? `\n上一次计划未通过校验：${JSON.stringify(params.repair.rejectedPlan)}\n失败原因：${params.repair.error}\n请修复 toolName 或 args；如果缺少必要信息，返回 missingSlots。`
    : "";

  return callAnthropicCompatible({
    maxTokens: 1024,
    system:
      `你是业务系统的 AI 工具编排器。必须只返回 JSON，不要解释，不要 Markdown。` +
      `JSON 格式：{"intent":"意图","toolName":"工具名","args":{},"confidence":0.0,"missingSlots":[],"reason":"原因"}。` +
      `toolName 必须逐字复制候选工具名之一，不能缩写、翻译或自造别名。候选工具名：${toolNames}。` +
      `如果用户意图不明确或缺少必填参数，toolName 返回空字符串，并在 missingSlots 中列出字段名。` +
      `只规划一个最匹配的工具。READ 用于查询；WRITE/HIGH_RISK 只会生成确认卡，不会直接写库。` +
      `${describeAssistantIntentPolicyForPrompt()}` +
      `如果用户是在问某功能在哪、怎么打开、某页面能做什么，优先使用 navigate_to_feature 或 feature_help，并把 args.capabilityId 设置为全站能力候选 id。` +
      `关键边界：后台“最近有哪些订单/订单情况/待支付订单”是 order_summary；客户/用户/会员“有多少/总数/消费最高”是 customer_analytics_summary；客户“买了什么/买过什么/购买记录”是购买历史查询；“我要下单/帮客户开单/要 N 箱”才是下单或开单；库存总量、库存最多、低库存属于商品经营查询，不是经销商上报库存。` +
      `管理员代查指定客户购物车/优惠券/订单/欠款/账户用 admin_customer_* 工具；管理员代查指定经销商待接单/结算/库存/推广用 admin_dealer_* 工具。`,
    messages: [
      {
        role: "user",
        content: `当前角色：${params.context.role}\n候选工具：\n${toolsText}\n\n全站能力候选：\n${capabilitiesText}\n\n用户请求：${params.message}${repairText}`,
      },
    ],
  });
}

export async function planWithModelV2(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): Promise<ModelPlannerResult> {
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  const rankedCapabilities = rankAgentCapabilitiesForMessage(message, context);
  if (!hasAiProvider()) return { plan: null, rankedTools, rankedCapabilities, missingSlots: [], error: "AI provider 未配置" };

  try {
    const rawText = await callModelPlanner({ message, context, rankedTools, toolLimit: AI_PLANNER_CORE_TOOL_LIMIT });
    const parsed = extractJsonObject(rawText);
    if (!parsed) return { plan: null, rankedTools, rankedCapabilities, missingSlots: [], rawText, error: "provider 未返回可解析 JSON" };
    const { plan, missingSlots } = asPlan(parsed, rankedTools);
    return { plan, rankedTools, rankedCapabilities, missingSlots, rawText };
  } catch (error) {
    return { plan: null, rankedTools, rankedCapabilities, missingSlots: [], error: error instanceof Error ? error.message : "provider 调用失败" };
  }
}

export async function repairModelPlan(
  message: string,
  context: AiToolContext,
  tools: readonly AiToolDefinition[],
  rejectedPlan: AiToolPlan | null,
  error: string,
): Promise<ModelPlannerResult> {
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  const rankedCapabilities = rankAgentCapabilitiesForMessage(message, context);
  if (!hasAiProvider()) return { plan: null, rankedTools, rankedCapabilities, missingSlots: [], error: "AI provider 未配置" };

  try {
    const rawText = await callModelPlanner({ message, context, rankedTools, toolLimit: AI_PLANNER_EXPANDED_TOOL_LIMIT, repair: { rejectedPlan, error } });
    const parsed = extractJsonObject(rawText);
    if (!parsed) return { plan: null, rankedTools, rankedCapabilities, missingSlots: [], rawText, error: "provider 修复未返回可解析 JSON" };
    const { plan, missingSlots } = asPlan(parsed, rankedTools);
    return { plan, rankedTools, rankedCapabilities, missingSlots, rawText };
  } catch (repairError) {
    return { plan: null, rankedTools, rankedCapabilities, missingSlots: [], error: repairError instanceof Error ? repairError.message : "provider 修复失败" };
  }
}

export function planAgentCapabilityNavigation(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (!tools.some((tool) => tool.name === "navigate_to_feature")) return null;
  if (!shouldBoostNavigationTools(message)) return null;
  const best = findBestAgentCapabilityForMessage(message, context, /在哪|哪里|入口|打开|进入|跳转|页面|菜单|配置|管理|怎么|如何|查看/.test(message) ? 7 : 14);
  if (!best) return null;
  return {
    toolName: "navigate_to_feature",
    args: { capabilityId: best.capability.id, query: message },
    reason: `全站能力目录匹配：${best.capability.title}`,
    intent: "navigate_feature",
    confidence: Math.min(0.95, best.score / 30),
  };
}

function inferPeriod(message: string) {
  if (/全部|累计|所有|历史/.test(message)) return "all";
  if (/今天|今日|当天/.test(message)) return "day";
  if (/本周|这周|最近7天|近7天/.test(message)) return "week";
  return "month";
}

function inferLimit(message: string) {
  const number = Number(message.match(/(?:前|top)?\s*(\d{1,2})\s*(?:个|条|张|家|项)?/i)?.[1] ?? 8);
  return Number.isFinite(number) ? Math.min(Math.max(number, 1), 20) : 8;
}

function argsForSemanticReadFallback(toolName: string, message: string): Record<string, unknown> | null {
  const period = inferPeriod(message);
  const limit = inferLimit(message);
  const summaryArgs = { period, limit, query: "" };
  if (
    [
      "purchase_supplier_summary",
      "product_catalog_summary",
      "inventory_records_summary",
      "wechat_ecosystem_summary",
      "audit_log_summary",
      "finance_statement_summary",
      "delivery_summary",
      "channel_pipeline_summary",
      "dealer_promotion_summary",
    ].includes(toolName)
  ) {
    return summaryArgs;
  }
  if (toolName === "shop_cart_summary" || toolName === "shop_coupon_summary") return { limit };
  if (toolName === "shop_account_summary") return {};
  if (toolName === "salesperson_performance") return { salespersonName: "", period: period === "all" ? "month" : period };
  return null;
}

export function planRankedReadToolFallback(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  const candidate = rankedTools.find((item) => item.tool.riskLevel === "READ" && item.tool.name !== "navigate_to_feature" && item.tool.name !== "feature_help");
  if (!candidate || candidate.score < 12) return null;
  const args = argsForSemanticReadFallback(candidate.tool.name, message);
  if (!args) return null;
  return {
    toolName: candidate.tool.name,
    args,
    reason: `本地语义 READ 匹配：${candidate.tool.title}`,
    intent: "semantic_read",
    confidence: Math.min(0.9, candidate.score / 30),
  };
}

function labelMissingSlots(missingSlots: readonly string[]) {
  return uniqueStrings(missingSlots.map((slot) => slotLabelMap[slot] ?? slot));
}

export function buildClarificationResponse(
  message: string,
  rankedTools: readonly RankedAiTool[],
  missingSlots: readonly string[] = [],
  rejectionReason?: string,
): { answer: string; card: AiAssistantCard } {
  const topTool = rankedTools[0]?.tool;
  const labels = labelMissingSlots(missingSlots);
  const example = topTool?.examples?.[0];
  const reasonText = rejectionReason ? `我理解了大方向，但现在不能直接执行：${rejectionReason}` : "";
  const missingText = labels.length ? `请补充${labels.join("、")}。` : "";
  const exampleText = example ? `你可以这样说：“${example}”。` : `你可以补充要查询或操作的具体对象。`;
  const answer = [reasonText, missingText || "我还需要更明确的对象或范围。", exampleText].filter(Boolean).join("\n");

  return {
    answer,
    card: {
      kind: "result",
      title: "需要补充信息",
      summary: message ? "这次请求还没有形成可安全执行的工具计划。" : "请先输入要处理的事项。",
      details: [
        ...(topTool ? [{ label: "最可能的工具", value: topTool.title }] : []),
        ...(labels.length ? [{ label: "需要补充", value: labels.join("、") }] : []),
        ...(rejectionReason ? [{ label: "校验结果", value: rejectionReason }] : []),
        ...(example ? [{ label: "示例", value: example }] : []),
      ],
    },
  };
}
