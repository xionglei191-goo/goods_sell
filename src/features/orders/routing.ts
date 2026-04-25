import type { Prisma } from "@prisma/client";

import { buildOrderNoSequence, toMoney } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type DbLike = Prisma.TransactionClient | typeof prisma;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type RoutingItem = {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
  totalAmount: Prisma.Decimal;
  product: {
    bulkThreshold: number;
  };
};

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

async function generateChildOrderNo(tx: DbLike, suffix: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  return `${buildOrderNoSequence(count, now)}-${suffix}`;
}

async function findNearestDealer(tx: DbLike, address: Coordinate, excludedDealerIds: string[] = []) {
  const dealers = await tx.dealer.findMany({
    where: {
      isAccepting: true,
      id: excludedDealerIds.length > 0 ? { notIn: excludedDealerIds } : undefined,
    },
    include: {
      customer: { select: { name: true } },
    },
  });

  const candidates = dealers
    .map((dealer) => {
      const distance = calculateDistanceKm(address, {
        latitude: Number(dealer.latitude),
        longitude: Number(dealer.longitude),
      });
      return { dealer, distance };
    })
    .sort((a, b) => a.distance - b.distance);

  return candidates.find((candidate) => candidate.distance * 1000 <= candidate.dealer.serviceRadius) ?? candidates[0] ?? null;
}

async function assignDealer(tx: DbLike, orderId: string, address: Coordinate, excludedDealerIds: string[] = []) {
  const existingActive = await tx.orderRouting.findFirst({
    where: { orderId, status: { in: ["PENDING", "ACCEPTED"] } },
    select: { id: true },
  });

  if (existingActive) {
    return { assigned: true as const, routingId: existingActive.id };
  }

  const nearest = await findNearestDealer(tx, address, excludedDealerIds);
  if (!nearest) {
    await tx.order.update({ where: { id: orderId }, data: { routingType: "WAREHOUSE" } });
    return { assigned: false as const };
  }

  const routing = await tx.orderRouting.create({
    data: {
      orderId,
      dealerId: nearest.dealer.id,
      status: "PENDING",
      distance: toMoney(nearest.distance),
    },
    select: { id: true },
  });
  await tx.order.update({ where: { id: orderId }, data: { routingType: "DEALER" } });
  return { assigned: true as const, routingId: routing.id, dealerId: nearest.dealer.id, distance: nearest.distance };
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
      items: { include: { product: { select: { bulkThreshold: true } } } },
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

  const address = { latitude, longitude };
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
    const assigned = await assignDealer(tx, order.id, address);
    return { routingType: assigned.assigned ? ("DEALER" as const) : ("WAREHOUSE" as const), assigned };
  }

  await tx.order.update({ where: { id: order.id }, data: { routingType: "WAREHOUSE" } });
  if (order.children.length === 0) {
    const warehouseChild = await createSplitChild(tx, order, largeItems, "W", "WAREHOUSE");
    const dealerChild = await createSplitChild(tx, order, smallItems, "D", "DEALER");
    await assignDealer(tx, dealerChild.id, address);
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
      include: { order: { include: { address: true } } },
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
      { latitude, longitude },
      previous.map((item) => item.dealerId),
    );
  });
}
