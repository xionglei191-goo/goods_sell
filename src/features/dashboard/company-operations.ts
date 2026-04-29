import type { Prisma } from "@prisma/client";

import { evaluateCustomerSegment, type CustomerSegment } from "@/features/customers/segmentation";
import { evaluateDealerTier, type DealerTier } from "@/features/dealers/segmentation";
import { prisma } from "@/lib/prisma";

const revenueStatuses = ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"] as const;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function reasonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function reasonEvents(value: Prisma.JsonValue | null | undefined) {
  const events = reasonObject(value).events;
  return Array.isArray(events)
    ? events
        .map((event) => {
          if (!event || typeof event !== "object" || Array.isArray(event)) return "";
          const row = event as Record<string, unknown>;
          return typeof row.event === "string" ? row.event : "";
        })
        .filter(Boolean)
    : [];
}

function hasEvent(events: string[], event: string) {
  return events.includes(event);
}

function pushNextAction(group: { total: number; opened: number; converted: number; repurchase: number }) {
  if (group.total === 0) return "先补足推送样本";
  if (group.opened === 0) return "优化首句和触达渠道";
  if (group.converted === 0) return "补充试饮、组合价或首单政策";
  if (group.repurchase === 0) return "设置复购提醒和二次触达";
  return "保留为新品重点人群";
}

export async function getCompanyOperationsData() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const last14Start = addDays(todayStart, -13);
  const last30Start = addDays(todayStart, -29);

  const [orders, dealers, customers, leads, productPushes, salespersonCodes, conflicts] = await Promise.all([
    prisma.order.findMany({
      where: { parentId: null, createdAt: { gte: last30Start }, status: { in: [...revenueStatuses] } },
      select: {
        id: true,
        payableAmount: true,
        createdAt: true,
        address: { select: { district: true } },
      },
    }),
    prisma.dealer.findMany({
      include: {
        customer: { select: { salesPersonId: true, salesPerson: { select: { id: true, name: true } } } },
        routings: {
          select: {
            status: true,
            assignedAt: true,
            respondedAt: true,
            order: { select: { status: true, payableAmount: true } },
          },
        },
        stocks: { select: { stock: true, reportedAt: true } },
        leads: { select: { createdAt: true } },
        promoterCodes: { select: { isActive: true, scanCount: true, leadCount: true, orderCount: true } },
        channelConflicts: { select: { type: true, status: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 600,
    }),
    prisma.customer.findMany({
      include: {
        profile: { select: { tags: true } },
        tags: true,
        orders: {
          where: { parentId: null },
          select: { type: true, status: true, payableAmount: true, createdAt: true },
        },
        leads: { select: { scene: true, metadata: true, notes: true, createdAt: true } },
        inquiries: { select: { scene: true, budget: true, content: true, notes: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: last30Start } },
      select: {
        id: true,
        status: true,
        source: true,
        createdAt: true,
        salespersonId: true,
        dealer: { select: { zone: true } },
      },
    }),
    prisma.productPush.findMany({
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.promoterCode.findMany({
      where: { ownerType: "SALESPERSON", isActive: true, salespersonId: { not: null } },
      select: {
        salespersonId: true,
        salesperson: { select: { name: true } },
        scanCount: true,
        leadCount: true,
        orderCount: true,
      },
    }),
    prisma.channelConflict.findMany({
      where: {
        OR: [{ createdAt: { gte: last14Start } }, { status: { in: ["OPEN", "PROCESSING"] } }],
      },
      select: {
        type: true,
        status: true,
        createdAt: true,
        dealer: { select: { zone: true } },
      },
    }),
  ]);

  const dealerTierCounts: Record<DealerTier, number> = { ACTIVE: 0, STANDARD: 0, TO_ACTIVATE: 0, RISK: 0 };
  const salespersonMap = new Map<string, { name: string; dealerCount: number; scans: number; leads: number; orders: number }>();
  const zoneMap = new Map<
    string,
    { zone: string; revenue: number; orderCount: number; dealerCount: number; activeDealerCount: number; leadCount: number; openConflictCount: number }
  >();
  const getZone = (zone: string) => {
    const key = zone || "未标记区域";
    const current = zoneMap.get(key) ?? { zone: key, revenue: 0, orderCount: 0, dealerCount: 0, activeDealerCount: 0, leadCount: 0, openConflictCount: 0 };
    zoneMap.set(key, current);
    return current;
  };

  for (const order of orders) {
    const current = getZone(order.address.district);
    current.orderCount += 1;
    current.revenue += Number(order.payableAmount);
  }

  for (const dealer of dealers) {
    const segmentation = evaluateDealerTier(dealer);
    dealerTierCounts[segmentation.tier] += 1;
    const current = getZone(dealer.zone);
    current.dealerCount += 1;
    if (dealer.isAccepting) current.activeDealerCount += 1;

    if (dealer.customer.salesPersonId) {
      const salesPersonId = dealer.customer.salesPersonId;
      const salesperson = salespersonMap.get(salesPersonId) ?? {
        name: dealer.customer.salesPerson?.name ?? "未绑定业务员",
        dealerCount: 0,
        scans: 0,
        leads: 0,
        orders: 0,
      };
      salesperson.dealerCount += 1;
      salespersonMap.set(salesPersonId, salesperson);
    }
  }

  for (const lead of leads) {
    getZone(lead.dealer?.zone ?? "未标记区域").leadCount += 1;
  }

  for (const conflict of conflicts) {
    if (conflict.status === "OPEN" || conflict.status === "PROCESSING") {
      getZone(conflict.dealer?.zone ?? "未标记区域").openConflictCount += 1;
    }
  }

  for (const code of salespersonCodes) {
    if (!code.salespersonId) continue;
    const salesperson = salespersonMap.get(code.salespersonId) ?? {
      name: code.salesperson?.name ?? "未绑定业务员",
      dealerCount: 0,
      scans: 0,
      leads: 0,
      orders: 0,
    };
    salesperson.scans += code.scanCount;
    salesperson.leads += code.leadCount;
    salesperson.orders += code.orderCount;
    salespersonMap.set(code.salespersonId, salesperson);
  }

  const customerSegmentCounts: Record<CustomerSegment, { count: number; revenue: number }> = {
    HIGH_VALUE_GROUP_BUY: { count: 0, revenue: 0 },
    RESTAURANT: { count: 0, revenue: 0 },
    TOBACCO_WINE_STORE: { count: 0, revenue: 0 },
    BANQUET: { count: 0, revenue: 0 },
    REGULAR: { count: 0, revenue: 0 },
  };
  for (const customer of customers) {
    const segmentation = evaluateCustomerSegment(customer);
    customerSegmentCounts[segmentation.segment].count += 1;
    customerSegmentCounts[segmentation.segment].revenue += segmentation.metrics.totalSpent;
  }

  const pushMap = new Map<string, { productName: string; targetTag: string; total: number; opened: number; converted: number; repurchase: number }>();
  for (const push of productPushes) {
    const events = reasonEvents(push.reason);
    const productName = push.product?.name ?? "商品已下架";
    const targetTag = push.targetTag ?? "未指定人群";
    const key = `${push.productId ?? "none"}:${targetTag}`;
    const current = pushMap.get(key) ?? { productName, targetTag, total: 0, opened: 0, converted: 0, repurchase: 0 };
    const opened = push.status === "OPENED" || push.status === "CLICKED" || push.status === "CONVERTED" || Boolean(push.openedAt) || hasEvent(events, "OPENED");
    const repurchase = hasEvent(events, "REPURCHASED");
    const converted = push.status === "CONVERTED" || Boolean(push.convertedAt) || hasEvent(events, "ORDERED") || repurchase;
    current.total += 1;
    if (opened) current.opened += 1;
    if (converted) current.converted += 1;
    if (repurchase) current.repurchase += 1;
    pushMap.set(key, current);
  }

  const totalPushes = productPushes.length;
  const convertedPushes = Array.from(pushMap.values()).reduce((sum, item) => sum + item.converted, 0);
  const days = Array.from({ length: 14 }, (_, index) => addDays(last14Start, index));
  const conflictTrend = days.map((day) => {
    const nextDay = addDays(day, 1);
    const dayConflicts = conflicts.filter((conflict) => conflict.createdAt >= day && conflict.createdAt < nextDay);
    return {
      label: dayLabel(day),
      total: dayConflicts.length,
      OPEN: dayConflicts.filter((conflict) => conflict.status === "OPEN").length,
      PROCESSING: dayConflicts.filter((conflict) => conflict.status === "PROCESSING").length,
      RESOLVED: dayConflicts.filter((conflict) => conflict.status === "RESOLVED").length,
      IGNORED: dayConflicts.filter((conflict) => conflict.status === "IGNORED").length,
    };
  });

  const openConflicts = conflicts.filter((conflict) => conflict.status === "OPEN" || conflict.status === "PROCESSING").length;

  return {
    summary: {
      revenue30d: orders.reduce((sum, order) => sum + Number(order.payableAmount), 0),
      orderCount30d: orders.length,
      zoneCount: zoneMap.size,
      dealerCount: dealers.length,
      activeDealerCount: dealers.filter((dealer) => dealer.isAccepting).length,
      riskDealerCount: dealerTierCounts.RISK,
      customerCount: customers.length,
      leadCount30d: leads.length,
      salespersonScanCount: Array.from(salespersonMap.values()).reduce((sum, item) => sum + item.scans, 0),
      salespersonLeadCount: Array.from(salespersonMap.values()).reduce((sum, item) => sum + item.leads, 0),
      pushConversionRate: totalPushes > 0 ? convertedPushes / totalPushes : 0,
      openConflicts,
    },
    zones: Array.from(zoneMap.values())
      .sort((a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount)
      .slice(0, 8),
    dealerTiers: dealerTierCounts,
    customerSegments: Object.entries(customerSegmentCounts)
      .map(([segment, item]) => ({ segment: segment as CustomerSegment, ...item }))
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count),
    salespeople: Array.from(salespersonMap.values())
      .sort((a, b) => b.leads + b.orders * 2 + b.scans / 10 - (a.leads + a.orders * 2 + a.scans / 10))
      .slice(0, 6),
    productPushes: Array.from(pushMap.values())
      .sort((a, b) => b.converted - a.converted || b.opened - a.opened || b.total - a.total)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        openRate: item.total > 0 ? item.opened / item.total : 0,
        conversionRate: item.total > 0 ? item.converted / item.total : 0,
        nextAction: pushNextAction(item),
      })),
    conflictTrend,
  };
}

export type CompanyOperationsData = Awaited<ReturnType<typeof getCompanyOperationsData>>;
