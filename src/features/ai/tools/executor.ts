import { createHmac, timingSafeEqual } from "crypto";

import { logAction } from "@/features/logs/audit";
import { roleHasPermission } from "@/features/auth/permissions";
import { compactAiAuditJson, redactAiAuditValue } from "@/features/ai/tools/audit";
import { aiTools } from "@/features/ai/tools/registry";
import type { AiAssistantCard, AiPendingAction, AiToolContext, AiToolDefinition, AiToolExecution, AnyToolInput } from "@/features/ai/tools/types";

export class AiToolError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function needsConfirmation(tool: AiToolDefinition) {
  return tool.riskLevel === "WRITE" || tool.riskLevel === "HIGH_RISK";
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function confirmationSecret() {
  return process.env.AI_TOOL_CONFIRM_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "local-ai-tool-confirm-secret";
}

function signPayload(payload: string) {
  return createHmac("sha256", confirmationSecret()).update(payload).digest("base64url");
}

function createConfirmationToken(params: { tool: AiToolDefinition; args: Record<string, unknown>; context: AiToolContext }) {
  const payload = {
    toolName: params.tool.name,
    riskLevel: params.tool.riskLevel,
    userId: params.context.user.id,
    role: params.context.role,
    args: params.args,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(stableStringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

function verifyConfirmationToken(params: {
  token?: string;
  tool: AiToolDefinition;
  args: Record<string, unknown>;
  context: AiToolContext;
}) {
  if (!params.token) {
    throw new AiToolError("确认凭证缺失，请重新生成确认卡片", 400);
  }

  const [encoded, signature] = params.token.split(".");
  if (!encoded || !signature) {
    throw new AiToolError("确认凭证无效，请重新生成确认卡片", 400);
  }

  const expected = signPayload(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new AiToolError("确认凭证已失效，请重新生成确认卡片", 400);
  }

  type ConfirmationPayload = {
    toolName?: string;
    riskLevel?: string;
    userId?: string;
    role?: string;
    args?: unknown;
    expiresAt?: number;
  };
  let payload: ConfirmationPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConfirmationPayload;
  } catch {
    throw new AiToolError("确认凭证无效，请重新生成确认卡片", 400);
  }
  if (
    payload.toolName !== params.tool.name ||
    payload.riskLevel !== params.tool.riskLevel ||
    payload.userId !== params.context.user.id ||
    payload.role !== params.context.role ||
    stableStringify(payload.args) !== stableStringify(params.args)
  ) {
    throw new AiToolError("确认内容已变化，请重新生成确认卡片", 400);
  }

  if (!payload.expiresAt || payload.expiresAt < Date.now()) {
    throw new AiToolError("确认凭证已过期，请重新生成确认卡片", 400);
  }
}

export function canUseAiTool(context: AiToolContext, tool: AiToolDefinition) {
  const access = tool.access;
  if (!access) return true;
  if (access.roles && !access.roles.includes(context.role)) return false;
  if (access.permission && !roleHasPermission(context.role, access.permission)) return false;
  return true;
}

export function getAvailableAiTools(context: AiToolContext) {
  return aiTools.filter((tool) => canUseAiTool(context, tool));
}

export async function preflightAiTool(tool: AiToolDefinition, args: Record<string, unknown>, context: AiToolContext) {
  if (!canUseAiTool(context, tool)) {
    throw new AiToolError("无权限查看或操作该事项", 403);
  }

  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    throw new AiToolError(parsed.error.issues[0]?.message ?? "工具参数不完整", 400);
  }

  const parsedInput = parsed.data as AnyToolInput;
  const dynamicPermission = tool.resolvePermission?.(parsedInput, context);
  if (dynamicPermission && !roleHasPermission(context.role, dynamicPermission)) {
    throw new AiToolError("无权限查看或操作该事项", 403);
  }

  if (needsConfirmation(tool)) {
    await buildPendingAction(tool, args, context);
  }

  return { ok: true as const, parsedInput };
}

async function auditToolCall(params: {
  tool: AiToolDefinition;
  action: string;
  args: unknown;
  result?: unknown;
  summary: string;
}) {
  await logAction({
    module: "AI助手",
    action: params.action,
    targetType: "AITool",
    targetId: params.tool.name,
    targetName: params.tool.title,
    after: {
      args: redactAiAuditValue(params.args),
      result: redactAiAuditValue(params.result),
    },
    summary: `${params.summary}（${params.tool.name}）`,
  });
}

function resultCard(result: { title: string; summary: string; details?: Array<{ label: string; value: string }>; href?: string }): AiAssistantCard {
  return {
    kind: "result",
    title: result.title,
    summary: result.summary,
    details: result.details ?? [],
    href: result.href,
  };
}

async function buildPendingAction(tool: AiToolDefinition, args: Record<string, unknown>, context: AiToolContext): Promise<AiPendingAction> {
  const parsed = tool.inputSchema.parse(args) as AnyToolInput;
  const custom = tool.buildConfirmation
    ? await tool.buildConfirmation(parsed, context)
    : {
        title: tool.title,
        summary: `准备执行：${tool.description}`,
        details: [{ label: "风险等级", value: tool.riskLevel }],
        confirmLabel: tool.riskLevel === "HIGH_RISK" ? "二次确认" : "确认执行",
      };

  return {
    ...custom,
    toolName: tool.name,
    args,
    confirmationToken: createConfirmationToken({ tool, args, context }),
    riskLevel: tool.riskLevel,
    confirmTextRequired: tool.riskLevel === "HIGH_RISK" ? (custom.confirmTextRequired ?? "确认执行") : custom.confirmTextRequired,
  };
}

export async function executeAiTool(
  toolName: string,
  args: Record<string, unknown>,
  context: AiToolContext,
  options: { confirmed?: boolean; confirmText?: string; confirmationToken?: string } = {},
): Promise<AiToolExecution> {
  const tool = aiTools.find((item) => item.name === toolName);
  if (!tool) {
    throw new AiToolError("未找到对应的系统工具", 404);
  }

  if (!canUseAiTool(context, tool)) {
    await auditToolCall({
      tool,
      action: "越权工具请求",
      args,
      summary: `用户 ${context.user.name ?? context.user.id} 无权限调用 AI 工具`,
    });
    throw new AiToolError("无权限查看或操作该事项", 403);
  }

  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    throw new AiToolError(parsed.error.issues[0]?.message ?? "工具参数不完整", 400);
  }
  const parsedInput = parsed.data as AnyToolInput;

  const dynamicPermission = tool.resolvePermission?.(parsedInput, context);
  if (dynamicPermission && !roleHasPermission(context.role, dynamicPermission)) {
    await auditToolCall({
      tool,
      action: "越权工具请求",
      args,
      summary: `用户 ${context.user.name ?? context.user.id} 缺少 ${dynamicPermission} 权限`,
    });
    throw new AiToolError("无权限查看或操作该事项", 403);
  }

  if (needsConfirmation(tool) && !options.confirmed) {
    const pendingAction = await buildPendingAction(tool, args, context);
    await auditToolCall({
      tool,
      action: "工具待确认",
      args,
      result: { summary: pendingAction.summary },
      summary: `AI 工具生成确认卡片`,
    });
    return {
      status: "needs_confirmation",
      toolName: tool.name,
      pendingAction,
      card: { kind: "confirmation", pendingAction },
    };
  }

  if (needsConfirmation(tool)) {
    verifyConfirmationToken({ token: options.confirmationToken, tool, args, context });
  }

  if (tool.riskLevel === "HIGH_RISK" && options.confirmText?.trim() !== "确认执行") {
    throw new AiToolError("高风险操作需要输入“确认执行”后才能继续", 400);
  }

  const result = await tool.handler(parsedInput, context);
  await auditToolCall({
    tool,
    action: needsConfirmation(tool) ? "确认执行工具" : "执行工具",
    args,
    result: compactAiAuditJson(result),
    summary: result.summary,
  });

  return {
    status: "success",
    toolName: tool.name,
    result,
    card: resultCard(result),
  };
}
