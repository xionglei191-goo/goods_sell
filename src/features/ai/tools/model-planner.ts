import { callAnthropicCompatible, hasAiProvider } from "@/features/ai/provider";
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
  missingSlots: string[];
  rawText?: string;
  error?: string;
};

const TOP_TOOL_LIMIT = 10;
const MIN_MODEL_CONFIDENCE = 0.45;

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

export function rankAiToolsForMessage(message: string, _context: AiToolContext, tools: readonly AiToolDefinition[]) {
  return tools
    .map((tool, index) => scoreTool(message, tool, index))
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

export function describeRankedAiToolsForPrompt(rankedTools: readonly RankedAiTool[]) {
  return rankedTools.slice(0, TOP_TOOL_LIMIT).map(describeRankedTool).join("\n");
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
  repair?: { rejectedPlan: AiToolPlan | null; error: string };
}) {
  const toolsText = describeRankedAiToolsForPrompt(params.rankedTools);
  const toolNames = params.rankedTools.slice(0, TOP_TOOL_LIMIT).map((item) => item.tool.name).join(", ");
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
      `关键边界：客户“买了什么/买过什么/购买记录”是购买历史查询；“一共有多少客户/哪个客户消费最高”是客户统计分析；“我要下单/帮客户开单/要 N 箱”才是下单或开单；库存总量、库存最多、低库存属于商品经营查询，不是经销商上报库存。`,
    messages: [
      {
        role: "user",
        content: `当前角色：${params.context.role}\n候选工具：\n${toolsText}\n\n用户请求：${params.message}${repairText}`,
      },
    ],
  });
}

export async function planWithModelV2(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): Promise<ModelPlannerResult> {
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  if (!hasAiProvider()) return { plan: null, rankedTools, missingSlots: [], error: "AI provider 未配置" };

  try {
    const rawText = await callModelPlanner({ message, context, rankedTools });
    const parsed = extractJsonObject(rawText);
    if (!parsed) return { plan: null, rankedTools, missingSlots: [], rawText, error: "provider 未返回可解析 JSON" };
    const { plan, missingSlots } = asPlan(parsed, rankedTools);
    return { plan, rankedTools, missingSlots, rawText };
  } catch (error) {
    return { plan: null, rankedTools, missingSlots: [], error: error instanceof Error ? error.message : "provider 调用失败" };
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
  if (!hasAiProvider()) return { plan: null, rankedTools, missingSlots: [], error: "AI provider 未配置" };

  try {
    const rawText = await callModelPlanner({ message, context, rankedTools, repair: { rejectedPlan, error } });
    const parsed = extractJsonObject(rawText);
    if (!parsed) return { plan: null, rankedTools, missingSlots: [], rawText, error: "provider 修复未返回可解析 JSON" };
    const { plan, missingSlots } = asPlan(parsed, rankedTools);
    return { plan, rankedTools, missingSlots, rawText };
  } catch (repairError) {
    return { plan: null, rankedTools, missingSlots: [], error: repairError instanceof Error ? repairError.message : "provider 修复失败" };
  }
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
