import type { ChannelConflictStatus, ChannelConflictType, OrderStatus, RoutingStatus } from "@prisma/client";

export type DealerTier = "ACTIVE" | "STANDARD" | "TO_ACTIVATE" | "RISK";

export const dealerTierLabels: Record<DealerTier, string> = {
  ACTIVE: "活跃经销商",
  STANDARD: "普通经销商",
  TO_ACTIVATE: "待激活经销商",
  RISK: "风险经销商",
};

export const dealerTierClasses: Record<DealerTier, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  STANDARD: "bg-[var(--dashboard-transaction-soft)] text-[#b9472d]",
  TO_ACTIVATE: "bg-amber-50 text-amber-700",
  RISK: "bg-red-50 text-red-700",
};

type DealerRoutingSignal = {
  status: RoutingStatus;
  assignedAt: Date;
  respondedAt: Date | null;
  order: {
    status: OrderStatus;
    payableAmount: unknown;
  };
};

type DealerStockSignal = {
  stock: number;
  reportedAt: Date;
};

type DealerLeadSignal = {
  createdAt: Date;
};

type DealerPromoterSignal = {
  isActive: boolean;
  scanCount: number;
  leadCount: number;
  orderCount: number;
};

type DealerConflictSignal = {
  type: ChannelConflictType;
  status: ChannelConflictStatus;
  createdAt: Date;
};

export type DealerSegmentationInput = {
  isAccepting: boolean;
  createdAt: Date;
  routings: DealerRoutingSignal[];
  stocks: DealerStockSignal[];
  leads: DealerLeadSignal[];
  promoterCodes: DealerPromoterSignal[];
  channelConflicts: DealerConflictSignal[];
};

const revenueStatuses = new Set<OrderStatus>(["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"]);

function sinceDays(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function withinDays(date: Date | null, days: number, now: Date) {
  return Boolean(date && sinceDays(date, now) <= days);
}

function numberValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

export function evaluateDealerTier(dealer: DealerSegmentationInput, now = new Date()) {
  const acceptedRoutings = dealer.routings.filter((routing) => routing.status === "ACCEPTED");
  const rejectedRoutings = dealer.routings.filter((routing) => routing.status === "REJECTED");
  const pendingRoutings = dealer.routings.filter((routing) => routing.status === "PENDING");
  const recentAccepted = acceptedRoutings.filter((routing) => withinDays(routing.respondedAt ?? routing.assignedAt, 30, now));
  const recentRejected = rejectedRoutings.filter((routing) => withinDays(routing.respondedAt ?? routing.assignedAt, 30, now));
  const recentSignals = recentAccepted.length + recentRejected.length;
  const rejectionRate = recentSignals > 0 ? recentRejected.length / recentSignals : 0;
  const latestStockAt = dealer.stocks.reduce<Date | null>((latest, stock) => (!latest || stock.reportedAt > latest ? stock.reportedAt : latest), null);
  const stockReportedCount = dealer.stocks.length;
  const availableStockCount = dealer.stocks.filter((stock) => stock.stock > 0).length;
  const activeCodeCount = dealer.promoterCodes.filter((code) => code.isActive).length;
  const scanCount = dealer.promoterCodes.reduce((sum, code) => sum + code.scanCount, 0);
  const promoterLeadCount = dealer.promoterCodes.reduce((sum, code) => sum + code.leadCount, 0);
  const promoterOrderCount = dealer.promoterCodes.reduce((sum, code) => sum + code.orderCount, 0);
  const openConflicts = dealer.channelConflicts.filter((conflict) => conflict.status === "OPEN" || conflict.status === "PROCESSING");
  const recentRiskConflicts = openConflicts.filter(
    (conflict) => withinDays(conflict.createdAt, 60, now) && (conflict.type === "COMPLAINT" || conflict.type === "REJECTION" || conflict.type === "PRICE_ANOMALY"),
  );
  const revenue = acceptedRoutings
    .filter((routing) => revenueStatuses.has(routing.order.status))
    .reduce((sum, routing) => sum + numberValue(routing.order.payableAmount), 0);

  const metrics = {
    acceptedCount: acceptedRoutings.length,
    recentAcceptedCount: recentAccepted.length,
    rejectedCount: rejectedRoutings.length,
    recentRejectedCount: recentRejected.length,
    pendingCount: pendingRoutings.length,
    rejectionRate,
    stockReportedCount,
    availableStockCount,
    latestStockAt,
    activeCodeCount,
    scanCount,
    leadCount: Math.max(dealer.leads.length, promoterLeadCount),
    promoterOrderCount,
    openConflictCount: openConflicts.length,
    recentRiskConflictCount: recentRiskConflicts.length,
    revenue,
  };

  const reasons: string[] = [];
  if (!dealer.isAccepting) reasons.push("暂停接单");
  if (metrics.recentRiskConflictCount > 0) reasons.push("存在近期投诉、拒单或低价冲突");
  if (metrics.recentRejectedCount >= 3 && metrics.rejectionRate >= 0.5) reasons.push("近期拒单率偏高");
  if (metrics.activeCodeCount === 0) reasons.push("缺少有效推广码");
  if (metrics.stockReportedCount === 0) reasons.push("尚未上报库存");
  if (metrics.acceptedCount === 0) reasons.push("暂无接单记录");
  if (metrics.recentAcceptedCount >= 3) reasons.push("近 30 天接单活跃");
  if (metrics.availableStockCount >= 3) reasons.push("库存上报较完整");

  let tier: DealerTier = "STANDARD";
  if (!dealer.isAccepting || metrics.openConflictCount >= 2 || metrics.recentRiskConflictCount > 0 || (metrics.recentRejectedCount >= 3 && metrics.rejectionRate >= 0.5)) {
    tier = "RISK";
  } else if (metrics.acceptedCount === 0 && metrics.stockReportedCount === 0 && metrics.activeCodeCount === 0 && sinceDays(dealer.createdAt, now) >= 7) {
    tier = "TO_ACTIVATE";
  } else if (metrics.recentAcceptedCount >= 3 && metrics.availableStockCount >= 3 && metrics.activeCodeCount > 0 && metrics.openConflictCount === 0) {
    tier = "ACTIVE";
  }

  const nextAction =
    tier === "ACTIVE"
      ? "维持小单优先匹配，优先纳入新品试饮"
      : tier === "RISK"
        ? "销售负责人介入，复盘拒单、投诉或价格异常"
        : tier === "TO_ACTIVATE"
          ? "安排业务员拜访，生成门店码并补库存"
          : "补齐库存和推广码，观察接单与线索转化";

  return {
    tier,
    metrics,
    reasons: reasons.slice(0, 3),
    nextAction,
  };
}
