import type { OrderStatus, Prisma } from "@prisma/client";

import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

const deliveryStatuses: OrderStatus[] = ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"];

function normalizeStatus(value: string): OrderStatus | undefined {
  return deliveryStatuses.includes(value as OrderStatus) ? (value as OrderStatus) : undefined;
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function getDeliveryData(searchParams: SearchParams) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const filters = {
    status: firstParam(searchParams.status),
    q: firstParam(searchParams.q),
  };
  const status = normalizeStatus(filters.status);
  const where: Prisma.OrderWhereInput = {
    parentId: null,
    status: status ? status : { in: deliveryStatuses },
    ...(filters.q
      ? {
          OR: [
            { orderNo: { contains: filters.q, mode: "insensitive" } },
            { customer: { name: { contains: filters.q, mode: "insensitive" } } },
            { customer: { phone: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, pendingToday, shipping, deliveredToday, completedToday] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        address: true,
        delivery: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.order.count({ where: { parentId: null, status: { in: ["PAID", "CONFIRMED"] }, updatedAt: { gte: todayStart } } }),
    prisma.order.count({ where: { parentId: null, status: "SHIPPING" } }),
    prisma.order.count({ where: { parentId: null, status: "DELIVERED", updatedAt: { gte: todayStart } } }),
    prisma.order.count({ where: { parentId: null, status: "COMPLETED", updatedAt: { gte: todayStart } } }),
  ]);
  const totalToday = pendingToday + shipping + deliveredToday + completedToday;

  return {
    filters,
    summary: {
      pendingToday,
      shipping,
      deliveredToday,
      completionRate: totalToday > 0 ? Math.round(((deliveredToday + completedToday) / totalToday) * 100) : 0,
    },
    items: orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      address: `${order.address.province}${order.address.city}${order.address.district}${order.address.detail}`,
      receiver: `${order.address.name} ${order.address.phone}`,
      trackingNo: order.delivery?.trackingNo ?? null,
      deliveryStatus: order.delivery?.status ?? "PENDING",
      shippedAt: order.delivery?.shippedAt?.toISOString() ?? null,
      deliveredAt: order.delivery?.deliveredAt?.toISOString() ?? null,
      updatedAt: order.updatedAt.toISOString(),
    })),
  };
}

export async function getDeliveryDetail(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, phone: true } },
      address: true,
      delivery: true,
      routings: {
        include: { dealer: { include: { customer: { select: { name: true } } } } },
        orderBy: { assignedAt: "asc" },
      },
      items: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    address: `${order.address.province}${order.address.city}${order.address.district}${order.address.detail}`,
    receiver: `${order.address.name} ${order.address.phone}`,
    delivery: order.delivery
      ? {
          method: order.delivery.method,
          trackingNo: order.delivery.trackingNo,
          status: order.delivery.status,
          shippedAt: order.delivery.shippedAt?.toISOString() ?? null,
          deliveredAt: order.delivery.deliveredAt?.toISOString() ?? null,
        }
      : null,
    routings: order.routings.map((routing) => ({
      id: routing.id,
      dealerName: routing.dealer.shopName || routing.dealer.customer.name,
      status: routing.status,
      distance: Number(routing.distance),
      reason: routing.reason,
      assignedAt: routing.assignedAt.toISOString(),
      respondedAt: routing.respondedAt?.toISOString() ?? null,
    })),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
    })),
  };
}
