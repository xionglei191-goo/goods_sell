import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { normalizeAiPrompt } from "@/features/ai/intent-templates";
import { prisma } from "@/lib/prisma";
import type { AiToolContext } from "@/features/ai/tools/types";

export type AiPlanSource = "template" | "heuristic" | "model" | "correction" | "no_plan";

type PromptUsageContent = {
  role: AiToolContext["role"];
  input: string;
  normalized: string;
  count: number;
  toolCounts: Record<string, number>;
  firstSeenAt: string;
  lastSeenAt: string;
  lastToolName?: string;
  lastSource: AiPlanSource;
  lastStatus: string;
  candidate: boolean;
};

function hashPrompt(role: AiToolContext["role"], normalized: string) {
  return createHash("sha1").update(`${role}:${normalized}`).digest("hex").slice(0, 16);
}

function asUsageContent(value: unknown): PromptUsageContent | null {
  if (!value || typeof value !== "object") return null;
  const content = value as Partial<PromptUsageContent>;
  if (!content.normalized || !content.role || typeof content.count !== "number") return null;
  return {
    role: content.role,
    input: content.input ?? "",
    normalized: content.normalized,
    count: content.count,
    toolCounts: content.toolCounts ?? {},
    firstSeenAt: content.firstSeenAt ?? new Date().toISOString(),
    lastSeenAt: content.lastSeenAt ?? new Date().toISOString(),
    lastToolName: content.lastToolName,
    lastSource: content.lastSource ?? "no_plan",
    lastStatus: content.lastStatus ?? "unknown",
    candidate: Boolean(content.candidate),
  };
}

function json(value: PromptUsageContent): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export async function recordAiPromptUsage(params: {
  context: AiToolContext;
  input: string;
  source: AiPlanSource;
  toolName?: string | null;
  status: string;
}) {
  try {
    const normalized = normalizeAiPrompt(params.input);
    if (!normalized) return;

    const now = new Date().toISOString();
    const key = `ai_prompt_usage:${params.context.role}:${hashPrompt(params.context.role, normalized)}`;
    const existing = await prisma.aiContentCache.findUnique({ where: { key }, select: { content: true } });
    const previous = asUsageContent(existing?.content);
    const toolCounts = { ...(previous?.toolCounts ?? {}) };
    if (params.toolName) {
      toolCounts[params.toolName] = (toolCounts[params.toolName] ?? 0) + 1;
    }
    const topToolCount = params.toolName ? toolCounts[params.toolName] ?? 0 : 0;
    const count = (previous?.count ?? 0) + 1;
    const candidate = params.source === "model" && params.status === "success" && Boolean(params.toolName) && count >= 3 && topToolCount >= 3;
    const content: PromptUsageContent = {
      role: params.context.role,
      input: params.input.slice(0, 200),
      normalized: normalized.slice(0, 200),
      count,
      toolCounts,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      lastToolName: params.toolName ?? undefined,
      lastSource: params.source,
      lastStatus: params.status,
      candidate: previous?.candidate || candidate,
    };

    await prisma.aiContentCache.upsert({
      where: { key },
      create: { key, content: json(content) },
      update: { content: json(content) },
    });
  } catch {
    // 高频沉淀不能影响用户侧 AI 助手主链路。
  }
}
