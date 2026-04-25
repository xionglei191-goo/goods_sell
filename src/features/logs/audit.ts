import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
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
    const session = await auth();
    await prisma.auditLog.create({
      data: {
        operatorId: session?.user.type === "STAFF" ? session.user.id : null,
        operatorName: session?.user.name ?? "系统",
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
