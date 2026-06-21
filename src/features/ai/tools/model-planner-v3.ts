import { callAnthropicCompatible, hasAiProvider } from "@/features/ai/provider";
import { describeRankedAgentCapabilitiesForPrompt, rankAgentCapabilitiesForMessage, type RankedAgentCapability } from "@/features/ai/tools/capabilities";
import { describeAssistantIntentPolicyForPrompt, shouldRejectNavigationPlan } from "@/features/ai/tools/intent-policy";
import {
  AI_PLANNER_CORE_TOOL_LIMIT,
  AI_PLANNER_EXPANDED_TOOL_LIMIT,
  describeRankedAiToolsForPrompt,
  rankAiToolsForMessage,
  type RankedAiTool,
} from "@/features/ai/tools/model-planner";
import type { AiToolContext, AiToolDefinition, AiToolPlan, AiToolResult, AiToolRiskLevel } from "@/features/ai/tools/types";

export type AiIntentKind = "READ_SUMMARY" | "READ_RANKING" | "READ_DETAIL" | "NAVIGATE" | "DRAFT" | "WRITE" | "HIGH_RISK" | "CLARIFY";

export type AiIntentFrame = {
  intentKind: AiIntentKind;
  domain: string;
  operation: string;
  risk: AiToolRiskLevel | "NAVIGATE";
  timeRange: "all" | "day" | "week" | "month" | "";
  entities: Record<string, string>;
  metrics: string[];
  sort: string;
  missingSlots: string[];
  confidence: number;
};

export type AiToolStep = {
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  intent?: string;
  confidence?: number;
};

export type AiPlannerTrace = {
  plannerVersion: "v2" | "v3";
  intentKind?: AiIntentKind;
  toolNames: string[];
  confidence?: number;
};

export type AiPlannerV3Result = {
  plan: AiToolPlan | null;
  steps: AiToolStep[];
  intentFrame: AiIntentFrame | null;
  rankedTools: RankedAiTool[];
  rankedCapabilities: RankedAgentCapability[];
  missingSlots: string[];
  rawText?: string;
  error?: string;
};

type RawPlannerV3Json = {
  intentFrame?: unknown;
  steps?: unknown;
  toolName?: unknown;
  args?: unknown;
  confidence?: unknown;
  missingSlots?: unknown;
  reason?: unknown;
};

const intentKinds = new Set<AiIntentKind>(["READ_SUMMARY", "READ_RANKING", "READ_DETAIL", "NAVIGATE", "DRAFT", "WRITE", "HIGH_RISK", "CLARIFY"]);

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RawPlannerV3Json;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeIntentKind(value: unknown): AiIntentKind {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return intentKinds.has(raw as AiIntentKind) ? (raw as AiIntentKind) : "CLARIFY";
}

function normalizeRisk(value: unknown, kind: AiIntentKind): AiToolRiskLevel | "NAVIGATE" {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (raw === "READ" || raw === "DRAFT" || raw === "WRITE" || raw === "HIGH_RISK" || raw === "NAVIGATE") return raw;
  if (kind === "NAVIGATE") return "NAVIGATE";
  if (kind === "DRAFT") return "DRAFT";
  if (kind === "WRITE") return "WRITE";
  if (kind === "HIGH_RISK") return "HIGH_RISK";
  return "READ";
}

function normalizeTimeRange(value: unknown): AiIntentFrame["timeRange"] {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "all" || raw === "day" || raw === "week" || raw === "month") return raw;
  return "";
}

function normalizeIntentFrame(value: unknown, fallbackConfidence: number): AiIntentFrame {
  const record = asRecord(value);
  const intentKind = normalizeIntentKind(record.intentKind);
  const confidence = Number(record.confidence ?? fallbackConfidence);
  return {
    intentKind,
    domain: typeof record.domain === "string" ? record.domain.trim() : "",
    operation: typeof record.operation === "string" ? record.operation.trim() : "",
    risk: normalizeRisk(record.risk, intentKind),
    timeRange: normalizeTimeRange(record.timeRange),
    entities: Object.fromEntries(Object.entries(asRecord(record.entities)).map(([key, item]) => [key, String(item)])),
    metrics: asStringArray(record.metrics),
    sort: typeof record.sort === "string" ? record.sort.trim() : "",
    missingSlots: asStringArray(record.missingSlots),
    confidence: Number.isFinite(confidence) ? confidence : 0,
  };
}

function normalizeSteps(value: unknown, fallback: RawPlannerV3Json, rankedTools: readonly RankedAiTool[]) {
  const rawSteps = Array.isArray(value) ? value : fallback.toolName ? [{ toolName: fallback.toolName, args: fallback.args, reason: fallback.reason, confidence: fallback.confidence }] : [];
  const knownToolNames = new Set(rankedTools.map((item) => item.tool.name));
  return rawSteps
    .map((item) => {
      const record = asRecord(item);
      const toolName = typeof record.toolName === "string" ? record.toolName.trim() : "";
      const confidence = Number(record.confidence ?? fallback.confidence);
      return {
        toolName,
        args: asRecord(record.args),
        reason: typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : "Planner v3 规划",
        intent: typeof record.intent === "string" ? record.intent.trim() : undefined,
        confidence: Number.isFinite(confidence) ? confidence : undefined,
      } satisfies AiToolStep;
    })
    .filter((step) => step.toolName && knownToolNames.has(step.toolName));
}

function asPlannerResult(params: {
  parsed: RawPlannerV3Json;
  message: string;
  rankedTools: RankedAiTool[];
  rankedCapabilities: RankedAgentCapability[];
  rawText: string;
}): AiPlannerV3Result {
  const steps = normalizeSteps(params.parsed.steps, params.parsed, params.rankedTools);
  const firstConfidence = Number(steps[0]?.confidence ?? params.parsed.confidence ?? 0);
  const intentFrame = normalizeIntentFrame(params.parsed.intentFrame, firstConfidence);
  const missingSlots = Array.from(new Set([...intentFrame.missingSlots, ...asStringArray(params.parsed.missingSlots)]));

  if (shouldRejectNavigationPlan(params.message, steps)) {
    return { plan: null, steps: [], intentFrame, rankedTools: params.rankedTools, rankedCapabilities: params.rankedCapabilities, missingSlots, rawText: params.rawText, error: "业务查询被误规划为页面导航" };
  }

  if (!steps.length || intentFrame.intentKind === "CLARIFY" || missingSlots.length || intentFrame.confidence < 0.45) {
    return { plan: null, steps, intentFrame, rankedTools: params.rankedTools, rankedCapabilities: params.rankedCapabilities, missingSlots, rawText: params.rawText };
  }

  const plan: AiToolPlan = {
    toolName: steps[0].toolName,
    args: steps[0].args,
    reason: steps[0].reason,
    intent: intentFrame.operation || steps[0].intent,
    confidence: intentFrame.confidence,
    missingSlots,
  };

  return { plan, steps, intentFrame, rankedTools: params.rankedTools, rankedCapabilities: params.rankedCapabilities, missingSlots, rawText: params.rawText };
}

async function callPlannerV3(params: {
  message: string;
  context: AiToolContext;
  rankedTools: readonly RankedAiTool[];
  rankedCapabilities: readonly RankedAgentCapability[];
  toolLimit?: number;
  repair?: { rejectedPlan: AiPlannerV3Result | null; error: string };
}) {
  const toolLimit = params.toolLimit ?? AI_PLANNER_CORE_TOOL_LIMIT;
  const toolsText = describeRankedAiToolsForPrompt(params.rankedTools, toolLimit);
  const toolNames = params.rankedTools.slice(0, toolLimit).map((item) => item.tool.name).join(", ");
  const capabilitiesText = describeRankedAgentCapabilitiesForPrompt(params.rankedCapabilities);
  const repairText = params.repair
    ? `\n上一次 V3 计划未通过校验：${JSON.stringify({ frame: params.repair.rejectedPlan?.intentFrame, steps: params.repair.rejectedPlan?.steps })}\n失败原因：${params.repair.error}\n请修复 intentFrame 或 steps。`
    : "";

  return callAnthropicCompatible({
    maxTokens: 1400,
    system:
      `你是华启商城业务系统的 Planner v3。必须只返回 JSON，不要 Markdown。` +
      `JSON 结构：{"intentFrame":{"intentKind":"READ_SUMMARY|READ_RANKING|READ_DETAIL|NAVIGATE|DRAFT|WRITE|HIGH_RISK|CLARIFY","domain":"","operation":"","risk":"READ|DRAFT|WRITE|HIGH_RISK|NAVIGATE","timeRange":"all|day|week|month|","entities":{},"metrics":[],"sort":"","missingSlots":[],"confidence":0.0},"steps":[{"toolName":"","args":{},"reason":"","confidence":0.0}]}。` +
      `toolName 必须逐字复制候选工具名之一：${toolNames}。` +
      `READ 查询可以规划 1 到 3 个 READ steps；DRAFT/WRITE/HIGH_RISK 只能规划 1 个 step，且只会生成草稿或确认卡。` +
      `${describeAssistantIntentPolicyForPrompt()}` +
      `关键工具：订单列表/最近订单/订单状态分布 -> order_summary；销售员数量/排行/最好/转化 -> salesperson_performance；用户总数/客户总数/会员数量/消费最高 -> customer_analytics_summary；库存总量/最多/低库存 -> product_operations_summary；欠款排行/应收 -> finance_summary；配送客户/配送订单/待发货/配送中 -> delivery_summary。` +
      `管理员代查指定客户购物车/优惠券/订单/欠款/账户 -> admin_customer_cart_summary/admin_customer_coupon_summary/admin_customer_orders/admin_customer_receivables/admin_customer_account_summary；管理员代查指定经销商待接单/结算/库存/推广 -> admin_dealer_incoming_orders/admin_dealer_settlement_summary/admin_dealer_stock_summary/admin_dealer_promotion_summary。`,
    messages: [
      {
        role: "user",
        content: `当前角色：${params.context.role}\n候选工具：\n${toolsText}\n\n全站能力候选：\n${capabilitiesText}\n\n用户请求：${params.message}${repairText}`,
      },
    ],
  });
}

export async function planWithModelV3(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): Promise<AiPlannerV3Result> {
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  const rankedCapabilities = rankAgentCapabilitiesForMessage(message, context);
  if (!hasAiProvider()) return { plan: null, steps: [], intentFrame: null, rankedTools, rankedCapabilities, missingSlots: [], error: "AI provider 未配置" };

  try {
    const rawText = await callPlannerV3({ message, context, rankedTools, rankedCapabilities, toolLimit: AI_PLANNER_CORE_TOOL_LIMIT });
    const parsed = extractJsonObject(rawText);
    if (!parsed) return { plan: null, steps: [], intentFrame: null, rankedTools, rankedCapabilities, missingSlots: [], rawText, error: "provider 未返回可解析 V3 JSON" };
    return asPlannerResult({ parsed, message, rankedTools, rankedCapabilities, rawText });
  } catch (error) {
    return { plan: null, steps: [], intentFrame: null, rankedTools, rankedCapabilities, missingSlots: [], error: error instanceof Error ? error.message : "provider V3 调用失败" };
  }
}

export async function repairModelPlanV3(
  message: string,
  context: AiToolContext,
  tools: readonly AiToolDefinition[],
  rejectedPlan: AiPlannerV3Result | null,
  error: string,
): Promise<AiPlannerV3Result> {
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  const rankedCapabilities = rankAgentCapabilitiesForMessage(message, context);
  if (!hasAiProvider()) return { plan: null, steps: [], intentFrame: null, rankedTools, rankedCapabilities, missingSlots: [], error: "AI provider 未配置" };

  try {
    const rawText = await callPlannerV3({ message, context, rankedTools, rankedCapabilities, toolLimit: AI_PLANNER_EXPANDED_TOOL_LIMIT, repair: { rejectedPlan, error } });
    const parsed = extractJsonObject(rawText);
    if (!parsed) return { plan: null, steps: [], intentFrame: null, rankedTools, rankedCapabilities, missingSlots: [], rawText, error: "provider V3 修复未返回可解析 JSON" };
    return asPlannerResult({ parsed, message, rankedTools, rankedCapabilities, rawText });
  } catch (repairError) {
    return { plan: null, steps: [], intentFrame: null, rankedTools, rankedCapabilities, missingSlots: [], error: repairError instanceof Error ? repairError.message : "provider V3 修复失败" };
  }
}

export async function composeAssistantAnswer(params: {
  message: string;
  context: AiToolContext;
  trace: AiPlannerTrace;
  results: Array<{ toolName: string; result: AiToolResult }>;
}) {
  if (!hasAiProvider()) return null;
  try {
    const text = await callAnthropicCompatible({
      maxTokens: 700,
      system:
        `你是华启商城 AI 助手的结果总结器。请用简洁中文回答用户，只能使用工具结果里的事实，不得编造或补充未知数据。` +
        `如果工具结果为空，要直接说明没有查到。不要输出 JSON，不要提模型内部推理。`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            role: params.context.role,
            userQuestion: params.message,
            planner: params.trace,
            toolResults: params.results.map((item) => ({
              toolName: item.toolName,
              title: item.result.title,
              summary: item.result.summary,
              details: item.result.details ?? [],
              data: item.result.data ?? null,
            })),
          }),
        },
      ],
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}
