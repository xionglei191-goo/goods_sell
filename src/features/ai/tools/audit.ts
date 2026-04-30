import { logAction } from "@/features/logs/audit";
import type { AiToolPlan } from "@/features/ai/tools/types";

const sensitiveKeyPattern = /password|secret|token|apikey|api_key|authorization|confirmtext/i;

export function redactAiAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactAiAuditValue(item));
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKeyPattern.test(key))
      .map(([key, item]) => [key, redactAiAuditValue(item)]),
  );
}

export function compactAiAuditJson(value: unknown, maxLength = 1600) {
  try {
    const text = JSON.stringify(redactAiAuditValue(value));
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return "[unserializable]";
  }
}

export async function auditAiAssistant(params: {
  action: string;
  summary: string;
  input?: string;
  plan?: AiToolPlan | null;
  status?: string;
  result?: unknown;
  error?: unknown;
}) {
  await logAction({
    module: "AI助手",
    action: params.action,
    targetType: "AIAssistant",
    targetId: params.plan?.toolName ?? null,
    targetName: params.plan?.toolName ?? null,
    after: redactAiAuditValue({
      input: params.input,
      plan: params.plan,
      status: params.status,
      result: params.result,
      error: params.error instanceof Error ? params.error.message : params.error,
    }),
    summary: params.summary,
  });
}
