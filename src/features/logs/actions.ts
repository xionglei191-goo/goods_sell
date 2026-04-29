"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDashboardPermission } from "@/features/auth/guards";
import type { ActionResult } from "@/features/orders/types";
import { prisma } from "@/lib/prisma";

const clearSchema = z.object({
  beforeDate: z.string().min(1),
});

async function requireAdmin() {
  return requireDashboardPermission("logs:manage", "仅管理员可清除操作日志");
}

export async function clearAuditLogs(input: z.infer<typeof clearSchema>): Promise<ActionResult<{ deleted: number }>> {
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "请选择截止日期" } };
  }

  try {
    const user = await requireAdmin();
    const beforeDate = new Date(parsed.data.beforeDate);
    if (Number.isNaN(beforeDate.getTime())) throw new Error("截止日期不正确");
    beforeDate.setHours(23, 59, 59, 999);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: beforeDate },
        NOT: { operatorId: user.id, action: "清除日志" },
      },
    });
    await prisma.auditLog.create({
      data: {
        operatorId: user.id,
        operatorName: user.name ?? "管理员",
        module: "操作日志",
        action: "清除日志",
        targetType: "AuditLog",
        summary: `手动清除 ${beforeDate.toISOString().slice(0, 10)} 之前日志 ${result.count} 条`,
        after: { deleted: result.count, beforeDate: beforeDate.toISOString() },
      },
    });
    revalidatePath("/dashboard/logs");
    return { success: true, message: "日志已清除", data: { deleted: result.count } };
  } catch (error) {
    return { success: false, error: { code: "CLEAR_LOGS_FAILED", message: error instanceof Error ? error.message : "清除失败" } };
  }
}
