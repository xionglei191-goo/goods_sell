import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { getTestSessionUserFromEnv } from "@/features/auth/test-session";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  module: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetName?: string | null;
  before?: unknown;
  after?: unknown;
  summary: string;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function logAction(input: AuditInput) {
  try {
    const testUser = getTestSessionUserFromEnv();
    const session = testUser ? null : await auth();
    const user = testUser ?? session?.user;
    await prisma.auditLog.create({
      data: {
        operatorId: user?.type === "STAFF" ? user.id : null,
        operatorName: user?.name ?? "系统",
        module: input.module,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        targetName: input.targetName ?? null,
        before: toJson(input.before),
        after: toJson(input.after),
        summary: input.summary,
      },
    });
  } catch {
    // 审计日志不能阻断主业务流程。
  }
}
