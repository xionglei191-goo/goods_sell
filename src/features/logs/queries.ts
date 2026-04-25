import type { Prisma } from "@prisma/client";

import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

function parseDate(value: string, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function getAuditLogData(searchParams: SearchParams) {
  const filters = {
    module: firstParam(searchParams.module),
    operator: firstParam(searchParams.operator),
    startDate: firstParam(searchParams.startDate),
    endDate: firstParam(searchParams.endDate),
    page: Number(firstParam(searchParams.page) || 1),
  };
  const page = Number.isFinite(filters.page) && filters.page > 0 ? filters.page : 1;
  const pageSize = 20;
  const startDate = parseDate(filters.startDate);
  const endDate = parseDate(filters.endDate, true);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.module ? { module: filters.module } : {}),
    ...(filters.operator ? { operatorName: { contains: filters.operator, mode: "insensitive" } } : {}),
    ...(startDate || endDate ? { createdAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}),
  };

  const [logs, total, modules] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["module"],
      select: { module: true },
      orderBy: { module: "asc" },
    }),
  ]);

  return {
    filters: { ...filters, page },
    total,
    pageSize,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    modules: modules.map((item) => item.module),
    logs: logs.map((log) => ({
      id: log.id,
      operatorName: log.operatorName ?? "系统",
      module: log.module,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      targetName: log.targetName,
      before: log.before,
      after: log.after,
      summary: log.summary,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}
