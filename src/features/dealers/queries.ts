import type { Prisma } from "@prisma/client";

import { getSessionUser } from "@/features/auth/guards";
import { evaluateDealerTier, type DealerTier } from "@/features/dealers/segmentation";
import { firstParam, formatCurrency, formatDate, formatDateTime } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

const dealerTiers = ["ACTIVE", "STANDARD", "TO_ACTIVATE", "RISK"] as const;

function enumOrUndefined<T extends string>(value: string, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function getDealerManagementData(searchParams: SearchParams) {
  const user = await getSessionUser();
  const isSalesperson = user?.role === "SALESPERSON";
  const canReviewApplications = user?.role === "ADMIN";
  const filters = {
    q: firstParam(searchParams.q).trim(),
    tier: enumOrUndefined(firstParam(searchParams.tier), dealerTiers),
  };
  const filterWhere: Prisma.DealerWhereInput = {
    ...(filters.q
      ? {
          OR: [
            { shopName: { contains: filters.q, mode: "insensitive" } },
            { zone: { contains: filters.q, mode: "insensitive" } },
            { customer: { name: { contains: filters.q, mode: "insensitive" } } },
            { customer: { phone: { contains: filters.q, mode: "insensitive" } } },
            { customer: { salesPerson: { name: { contains: filters.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const scopeWhere: Prisma.DealerWhereInput = isSalesperson ? { customer: { salesPersonId: user.id } } : {};
  const where: Prisma.DealerWhereInput = {
    AND: [filterWhere, scopeWhere].filter((item) => Object.keys(item).length > 0),
  };

  const [dealers, pendingApplications, salespeople] = await Promise.all([
    prisma.dealer.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true, salesPerson: { select: { name: true, phone: true } } } },
        policy: true,
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
      take: 500,
    }),
    canReviewApplications
      ? prisma.lead.findMany({
          where: { scene: "DEALER_JOIN", status: { in: ["NEW", "ASSIGNED", "FOLLOWING"] } },
          include: {
            customer: { select: { name: true, phone: true } },
            salesperson: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : Promise.resolve([]),
    canReviewApplications
      ? prisma.user.findMany({
          where: { role: "SALESPERSON", isActive: true },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const items = dealers.map((dealer) => {
    const segmentation = evaluateDealerTier(dealer);
    return {
      id: dealer.id,
      shopName: dealer.shopName,
      contactName: dealer.customer.name,
      contactPhone: dealer.customer.phone,
      salesperson: dealer.customer.salesPerson ? `${dealer.customer.salesPerson.name} · ${dealer.customer.salesPerson.phone}` : "未绑定",
      zone: dealer.zone,
      serviceRadius: dealer.serviceRadius,
      isAccepting: dealer.isAccepting,
      policy: dealer.policy
        ? {
            priceLevel: dealer.policy.priceLevel,
            priority: dealer.policy.priority,
            minOrderAmount: formatCurrency(Number(dealer.policy.minOrderAmount)),
            maxOrderAmount: dealer.policy.maxOrderAmount ? formatCurrency(Number(dealer.policy.maxOrderAmount)) : null,
          }
        : null,
      createdAt: formatDate(dealer.createdAt),
      tier: segmentation.tier,
      reasons: segmentation.reasons,
      nextAction: segmentation.nextAction,
      metrics: {
        acceptedCount: segmentation.metrics.acceptedCount,
        recentAcceptedCount: segmentation.metrics.recentAcceptedCount,
        rejectedCount: segmentation.metrics.rejectedCount,
        recentRejectedCount: segmentation.metrics.recentRejectedCount,
        rejectionRate: `${Math.round(segmentation.metrics.rejectionRate * 100)}%`,
        stockReportedCount: segmentation.metrics.stockReportedCount,
        availableStockCount: segmentation.metrics.availableStockCount,
        latestStockAt: segmentation.metrics.latestStockAt ? formatDateTime(segmentation.metrics.latestStockAt) : "未上报",
        activeCodeCount: segmentation.metrics.activeCodeCount,
        scanCount: segmentation.metrics.scanCount,
        leadCount: segmentation.metrics.leadCount,
        promoterOrderCount: segmentation.metrics.promoterOrderCount,
        openConflictCount: segmentation.metrics.openConflictCount,
        revenue: formatCurrency(segmentation.metrics.revenue),
      },
    };
  });

  const tierCounts = items.reduce(
    (counts, item) => {
      counts[item.tier] += 1;
      return counts;
    },
    { ACTIVE: 0, STANDARD: 0, TO_ACTIVATE: 0, RISK: 0 } satisfies Record<DealerTier, number>,
  );
  const filteredItems = filters.tier ? items.filter((item) => item.tier === filters.tier) : items;

  return {
    filters,
    summary: {
      total: items.length,
      accepting: items.filter((item) => item.isAccepting).length,
      inactive: items.filter((item) => !item.isAccepting).length,
      pendingApplications: pendingApplications.length,
      ...tierCounts,
    },
    items: filteredItems,
    pendingApplications: pendingApplications.map((item) => {
      const metadata = jsonObject(item.metadata);
      return {
        id: item.id,
        shopName: stringValue(metadata.shopName) || item.name || item.customer?.name || "-",
        contactName: stringValue(metadata.contactName) || item.customer?.name || "-",
        phone: item.phone ?? item.customer?.phone ?? "-",
        zone: stringValue(metadata.zone),
        address: stringValue(metadata.address),
        businessLicense: stringValue(metadata.businessLicense),
        notes: item.notes ?? "",
        salesperson: item.salesperson?.name ?? "-",
        createdAt: formatDateTime(item.createdAt),
      };
    }),
    salespeople,
  };
}

export type DealerManagementData = Awaited<ReturnType<typeof getDealerManagementData>>;
