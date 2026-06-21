"use server";

import { z } from "zod";

import { requireDashboardPermission } from "@/features/auth/guards";
import type { DashboardPermission } from "@/features/auth/permissions";
import { logAction } from "@/features/logs/audit";

type ActionResult = { success: true; message?: string } | { success: false; error: { code: string; message: string } };

const exportAuditSchema = z.object({
  report: z.enum(["orders", "receipts", "statements"]),
  rowCount: z.coerce.number().int().min(0).max(10000),
});

const reportAuditMeta: Record<
  z.infer<typeof exportAuditSchema>["report"],
  {
    permission: DashboardPermission;
    action: string;
    targetType: string;
    targetName: string;
  }
> = {
  orders: {
    permission: "orders:view",
    action: "导出订单报表",
    targetType: "OrderExport",
    targetName: "订单列表 CSV",
  },
  receipts: {
    permission: "receipts:manage",
    action: "导出票据报表",
    targetType: "ReceiptExport",
    targetName: "收付款列表 CSV",
  },
  statements: {
    permission: "finance:manage",
    action: "导出财务对账单",
    targetType: "StatementExport",
    targetName: "客户对账单 HTML",
  },
};

export async function logReportExport(input: z.input<typeof exportAuditSchema>): Promise<ActionResult> {
  try {
    const parsed = exportAuditSchema.parse(input);
    const meta = reportAuditMeta[parsed.report];
    await requireDashboardPermission(meta.permission);
    await logAction({
      module: "报表",
      action: meta.action,
      targetType: meta.targetType,
      targetName: meta.targetName,
      after: { rowCount: parsed.rowCount },
      summary: `${meta.action}，导出 ${parsed.rowCount} 条记录`,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "EXPORT_AUDIT_FAILED",
        message: error instanceof Error ? error.message : "导出审计记录失败",
      },
    };
  }
}
