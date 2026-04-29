import type { Prisma } from "@prisma/client";

import { buildOrderNoSequence, toMoney } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type DbLike = Prisma.TransactionClient | typeof prisma;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type RoutingAddress = Coordinate & {
  zone?: string | null;
};

type RoutingContext = {
  amount: number;
  brandIds: string[];
  items: Array<{ productId: string; quantity: number }>;
  zone?: string | null;
};

type RoutingItem = {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  totalAmount: Prisma.Decimal;
  product: {
    brandId: string;
    bulkThreshold: number;
  };
};

type DealerWithPolicy = Prisma.DealerGetPayload<{
  include: {
    customer: { select: { name: true } };
    policy: true;
    stocks: { select: { productId: true; stock: true } };
  };
}>;

type DealerRoutingMetrics = {
  rejectedToday: number;
  recentAccepted: number;
  recentRejected: number;
  recentPending: number;
  avgResponseHours: number | null;
};

type DealerConflictMetrics = {
  openConflicts: number;
  recentRiskConflicts: number;
};

type DealerCandidate = {
  dealer: DealerWithPolicy;
  distance: number;
  score: number;
  reason: string;
};

const riskConflictTypes = new Set(["COMPLAINT", "REJECTION", "PRICE_ANOMALY", "STOCK_MISMATCH"]);

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function calculateDistanceKm(from: Coordinate, to: Coordinate) {
  const earthRadiusKm = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function splitItems(items: RoutingItem[]) {
  const largeItems = items.filter((item) => item.quantity >= item.product.bulkThreshold);
  const smallItems = items.filter((item) => item.quantity < item.product.bulkThreshold);
  return { largeItems, smallItems };
}

function buildRoutingContext(items: RoutingItem[], zone?: string | null): RoutingContext {
  return {
    amount: items.reduce((sum, item) => sum + Number(item.totalAmount), 0),
    brandIds: Array.from(new Set(items.map((item) => item.product.brandId))),
    items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    zone,
  };
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function matchesDealerPolicy(dealer: DealerWithPolicy, context: RoutingContext, rejectedToday: number) {
  if (!dealer.policy) return true;
  const minOrderAmount = Number(dealer.policy.minOrderAmount);
  const maxOrderAmount = dealer.policy.maxOrderAmount === null ? null : Number(dealer.policy.maxOrderAmount);
  if (context.amount < minOrderAmount) return false;
  if (maxOrderAmount !== null && context.amount > maxOrderAmount) return false;

  const allowedBrandIds = jsonStringArray(dealer.policy.brandIds);
  if (allowedBrandIds.length > 0 && !context.brandIds.every((brandId) => allowedBrandIds.includes(brandId))) {
    return false;
  }

  if (!dealer.policy.allowCrossZone && context.zone && dealer.zone !== context.zone) {
    return false;
  }

  if (!dealer.policy.allowReject && rejectedToday > 0) {
    return false;
  }

  if (dealer.policy.allowReject && dealer.policy.rejectLimitPerDay > 0 && rejectedToday >= dealer.policy.rejectLimitPerDay) {
    return false;
  }

  return true;
}

function hasDealerStock(dealer: DealerWithPolicy, context: RoutingContext) {
  const stockMap = new Map(dealer.stocks.map((stock) => [stock.productId, stock.stock]));
  return context.items.every((item) => (stockMap.get(item.productId) ?? 0) >= item.quantity);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getStockCoverage(dealer: DealerWithPolicy, context: RoutingContext) {
  if (context.items.length === 0) return { coveredItems: 0, totalItems: 0, ratio: 0 };

  const stockMap = new Map(dealer.stocks.map((stock) => [stock.productId, stock.stock]));
  let coveredItems = 0;
  let ratioSum = 0;
  for (const item of context.items) {
    const stock = stockMap.get(item.productId) ?? 0;
    if (stock >= item.quantity) coveredItems += 1;
    ratioSum += clamp(stock / Math.max(1, item.quantity), 0, 3);
  }

  return {
    coveredItems,
    totalItems: context.items.length,
    ratio: ratioSum / context.items.length,
  };
}

function buildRoutingMetrics(
  routingSignals: Array<{ dealerId: string; status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED"; assignedAt: Date; respondedAt: Date | null }>,
  today: Date,
) {
  const metrics = new Map<string, DealerRoutingMetrics>();
  for (const routing of routingSignals) {
    const current = metrics.get(routing.dealerId) ?? {
      rejectedToday: 0,
      recentAccepted: 0,
      recentRejected: 0,
      recentPending: 0,
      avgResponseHours: null,
    };

    if (routing.status === "ACCEPTED") current.recentAccepted += 1;
    if (routing.status === "REJECTED") {
      current.recentRejected += 1;
      if ((routing.respondedAt ?? routing.assignedAt) >= today) current.rejectedToday += 1;
    }
    if (routing.status === "PENDING") current.recentPending += 1;

    if (routing.respondedAt) {
      const responseHours = Math.max(0, routing.respondedAt.getTime() - routing.assignedAt.getTime()) / 3600000;
      current.avgResponseHours =
        current.avgResponseHours === null ? responseHours : (current.avgResponseHours + responseHours) / 2;
    }

    metrics.set(routing.dealerId, current);
  }
  return metrics;
}

function buildConflictMetrics(
  conflicts: Array<{ dealerId: string | null; type: string; status: "OPEN" | "PROCESSING" | "RESOLVED" | "IGNORED"; createdAt: Date }>,
  riskSince: Date,
) {
  const metrics = new Map<string, DealerConflictMetrics>();
  for (const conflict of conflicts) {
    if (!conflict.dealerId) continue;

    const current = metrics.get(conflict.dealerId) ?? { openConflicts: 0, recentRiskConflicts: 0 };
    if (conflict.status === "OPEN" || conflict.status === "PROCESSING") current.openConflicts += 1;
    if (conflict.createdAt >= riskSince && riskConflictTypes.has(conflict.type)) current.recentRiskConflicts += 1;
    metrics.set(conflict.dealerId, current);
  }
  return metrics;
}

function scoreDealerCandidate(
  dealer: DealerWithPolicy,
  distance: number,
  context: RoutingContext,
  routingMetrics: DealerRoutingMetrics,
  conflictMetrics: DealerConflictMetrics,
): DealerCandidate {
  const serviceRadiusKm = Math.max(0.1, dealer.serviceRadius / 1000);
  const distanceScore = clamp(1 - distance / Math.max(serviceRadiusKm, distance));
  const stockCoverage = getStockCoverage(dealer, context);
  const stockScore = 0.7 + clamp((stockCoverage.ratio - 1) / 2) * 0.3;
  const priority = dealer.policy?.priority ?? 0;
  const priorityScore = clamp((priority + 5) / 10);
  const serviceScore = clamp((distance <= serviceRadiusKm ? 0.75 : 0.3) + priorityScore * 0.25);
  const answered = routingMetrics.recentAccepted + routingMetrics.recentRejected;
  const acceptanceRate = answered > 0 ? routingMetrics.recentAccepted / answered : 0.55;
  const responseTimeScore =
    routingMetrics.avgResponseHours === null ? 0.55 : clamp(1 - routingMetrics.avgResponseHours / 24);
  const pendingPenalty = clamp(routingMetrics.recentPending / 5);
  const responseScore = clamp(acceptanceRate * 0.7 + responseTimeScore * 0.3 - pendingPenalty * 0.2);
  const riskPenalty = clamp(
    routingMetrics.rejectedToday * 0.18 +
      routingMetrics.recentRejected * 0.08 +
      conflictMetrics.openConflicts * 0.2 +
      conflictMetrics.recentRiskConflicts * 0.18,
  );
  const riskScore = 1 - riskPenalty;
  const score =
    distanceScore * 28 +
    stockScore * 22 +
    serviceScore * 18 +
    responseScore * 20 +
    riskScore * 12;

  return {
    dealer,
    distance,
    score,
    reason: [
      `综合评分 ${Math.round(score)}`,
      `距离 ${distance.toFixed(2)}km`,
      `库存 ${stockCoverage.coveredItems}/${stockCoverage.totalItems}`,
      `近30天接单 ${routingMetrics.recentAccepted}/${answered || routingMetrics.recentAccepted + routingMetrics.recentPending}`,
      `未结冲突 ${conflictMetrics.openConflicts}`,
    ].join(" · "),
  };
}

async function generateChildOrderNo(tx: DbLike, suffix: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  return `${buildOrderNoSequence(count, now)}-${suffix}`;
}

async function findBestDealer(tx: DbLike, address: RoutingAddress, context: RoutingContext, excludedDealerIds: string[] = []) {
  const dealers = await tx.dealer.findMany({
    where: {
      isAccepting: true,
      id: excludedDealerIds.length > 0 ? { notIn: excludedDealerIds } : undefined,
    },
    include: {
      customer: { select: { name: true } },
      policy: true,
      stocks: { select: { productId: true, stock: true } },
    },
  });
  const dealerIds = dealers.map((dealer) => dealer.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recentSince = new Date(today);
  recentSince.setDate(recentSince.getDate() - 30);
  const riskSince = new Date(today);
  riskSince.setDate(riskSince.getDate() - 60);
  const [routingSignals, conflicts] =
    dealerIds.length === 0
      ? [[], []]
      : await Promise.all([
          tx.orderRouting.findMany({
            where: {
              dealerId: { in: dealerIds },
              assignedAt: { gte: recentSince },
            },
            select: {
              dealerId: true,
              status: true,
              assignedAt: true,
              respondedAt: true,
            },
          }),
          tx.channelConflict.findMany({
            where: {
              dealerId: { in: dealerIds },
              OR: [
                { status: { in: ["OPEN", "PROCESSING"] } },
                {
                  createdAt: { gte: riskSince },
                  type: { in: ["COMPLAINT", "REJECTION", "PRICE_ANOMALY", "STOCK_MISMATCH"] },
                },
              ],
            },
            select: {
              dealerId: true,
              type: true,
              status: true,
              createdAt: true,
            },
          }),
        ]);
  const routingMetricsByDealer = buildRoutingMetrics(routingSignals, today);
  const conflictMetricsByDealer = buildConflictMetrics(conflicts, riskSince);

  const candidates = dealers
    .filter((dealer) => matchesDealerPolicy(dealer, context, routingMetricsByDealer.get(dealer.id)?.rejectedToday ?? 0))
    .filter((dealer) => hasDealerStock(dealer, context))
    .map((dealer) => {
      const distance = calculateDistanceKm(address, {
        latitude: Number(dealer.latitude),
        longitude: Number(dealer.longitude),
      });
      return scoreDealerCandidate(
        dealer,
        distance,
        context,
        routingMetricsByDealer.get(dealer.id) ?? {
          rejectedToday: 0,
          recentAccepted: 0,
          recentRejected: 0,
          recentPending: 0,
          avgResponseHours: null,
        },
        conflictMetricsByDealer.get(dealer.id) ?? { openConflicts: 0, recentRiskConflicts: 0 },
      );
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance);

  return candidates.find((candidate) => candidate.distance * 1000 <= candidate.dealer.serviceRadius) ?? candidates[0] ?? null;
}

async function assignDealer(tx: DbLike, orderId: string, address: RoutingAddress, context: RoutingContext, excludedDealerIds: string[] = []) {
  const existingActive = await tx.orderRouting.findFirst({
    where: { orderId, status: { in: ["PENDING", "ACCEPTED"] } },
    select: { id: true },
  });

  if (existingActive) {
    return { assigned: true as const, routingId: existingActive.id };
  }

  const best = await findBestDealer(tx, address, context, excludedDealerIds);
  if (!best) {
    await tx.order.update({ where: { id: orderId }, data: { routingType: "WAREHOUSE" } });
    return { assigned: false as const };
  }

  const routing = await tx.orderRouting.create({
    data: {
      orderId,
      dealerId: best.dealer.id,
      status: "PENDING",
      distance: toMoney(best.distance),
      reason: best.reason,
    },
    select: { id: true },
  });
  await tx.order.update({ where: { id: orderId }, data: { routingType: "DEALER" } });
  return { assigned: true as const, routingId: routing.id, dealerId: best.dealer.id, distance: best.distance, score: best.score };
}

async function createSplitChild(tx: DbLike, parent: {
  id: string;
  customerId: string;
  type: "RETAIL" | "WHOLESALE" | "GROUP_BUY";
  status: "PENDING_PAYMENT" | "PAID" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "COMPLETED" | "CANCELLED" | "REFUNDING" | "REFUNDED";
  discountAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  payMethod: "WECHAT" | "CASH" | "TRANSFER" | "CREDIT" | null;
  addressId: string;
  salesPersonId: string | null;
  remark: string | null;
}, items: RoutingItem[], suffix: string, routingType: "WAREHOUSE" | "DEALER") {
  const total = items.reduce((sum, item) => sum + Number(item.totalAmount), 0);
  const orderNo = await generateChildOrderNo(tx, suffix);
  return tx.order.create({
    data: {
      orderNo,
      customerId: parent.customerId,
      type: parent.type,
      status: parent.status,
      totalAmount: toMoney(total),
      discountAmount: "0.00",
      payableAmount: toMoney(total),
      paidAmount: parent.payMethod === "CREDIT" ? "0.00" : toMoney(total),
      payMethod: parent.payMethod,
      addressId: parent.addressId,
      routingType,
      salesPersonId: parent.salesPersonId,
      parentId: parent.id,
      remark: `${parent.remark ?? ""}${parent.remark ? "；" : ""}混合订单拆分-${suffix}`,
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalAmount: item.totalAmount,
        })),
      },
    },
    select: { id: true },
  });
}

export async function routeOrder(tx: DbLike, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      children: { select: { id: true } },
      items: { include: { product: { select: { brandId: true, bulkThreshold: true } } } },
    },
  });

  if (!order || order.parentId || order.status === "CANCELLED") {
    return { routingType: "SKIPPED" as const };
  }

  const latitude = toNumber(order.address.latitude);
  const longitude = toNumber(order.address.longitude);
  if (latitude === null || longitude === null) {
    await tx.order.update({ where: { id: order.id }, data: { routingType: "WAREHOUSE" } });
    return { routingType: "WAREHOUSE" as const, reason: "NO_COORDINATE" };
  }

  const address = { latitude, longitude, zone: order.address.district };
  const { largeItems, smallItems } = splitItems(order.items);

  if (smallItems.length === 0) {
    await tx.order.update({ where: { id: order.id }, data: { routingType: "WAREHOUSE" } });
    await tx.orderRouting.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "EXPIRED", reason: "大单总仓直发", respondedAt: new Date() },
    });
    return { routingType: "WAREHOUSE" as const };
  }

  if (largeItems.length === 0) {
    const assigned = await assignDealer(tx, order.id, address, buildRoutingContext(order.items, order.address.district));
    return { routingType: assigned.assigned ? ("DEALER" as const) : ("WAREHOUSE" as const), assigned };
  }

  await tx.order.update({ where: { id: order.id }, data: { routingType: "WAREHOUSE" } });
  if (order.children.length === 0) {
    const warehouseChild = await createSplitChild(tx, order, largeItems, "W", "WAREHOUSE");
    const dealerChild = await createSplitChild(tx, order, smallItems, "D", "DEALER");
    await assignDealer(tx, dealerChild.id, address, buildRoutingContext(smallItems, order.address.district));
    return { routingType: "MIXED" as const, warehouseOrderId: warehouseChild.id, dealerOrderId: dealerChild.id };
  }

  return { routingType: "MIXED" as const, reason: "ALREADY_SPLIT" };
}

export async function routeOrderById(orderId: string) {
  return prisma.$transaction((tx) => routeOrder(tx, orderId));
}

export async function rejectAndRematchRouting(routingId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const routing = await tx.orderRouting.findUnique({
      where: { id: routingId },
      include: { order: { include: { address: true, items: { include: { product: { select: { brandId: true, bulkThreshold: true } } } } } } },
    });

    if (!routing) {
      throw new Error("分单记录不存在");
    }

    await tx.orderRouting.update({
      where: { id: routing.id },
      data: { status: "REJECTED", reason, respondedAt: new Date() },
    });

    const latitude = toNumber(routing.order.address.latitude);
    const longitude = toNumber(routing.order.address.longitude);
    if (latitude === null || longitude === null) {
      await tx.order.update({ where: { id: routing.orderId }, data: { routingType: "WAREHOUSE" } });
      return { assigned: false as const };
    }

    const previous = await tx.orderRouting.findMany({
      where: { orderId: routing.orderId },
      select: { dealerId: true },
    });
    return assignDealer(
      tx,
      routing.orderId,
      { latitude, longitude, zone: routing.order.address.district },
      buildRoutingContext(routing.order.items, routing.order.address.district),
      previous.map((item) => item.dealerId),
    );
  });
}
