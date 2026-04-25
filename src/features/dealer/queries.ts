import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { formatCurrency, orderStatusLabels } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type DealerRoutingPayload = Prisma.OrderRoutingGetPayload<{
  include: {
    order: {
      include: {
        customer: { select: { name: true } };
        address: true;
        items: true;
      };
    };
  };
}>;

async function getDealerId(callbackUrl = "/dealer/incoming") {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "DEALER") {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const dealer = await prisma.dealer.findUnique({
    where: { customerId: session.user.id },
    include: { customer: { select: { name: true, phone: true } } },
  });

  if (!dealer) {
    redirect("/shop");
  }

  return dealer;
}

function mapRouting(routing: DealerRoutingPayload) {
  const status = routing.order.status as keyof typeof orderStatusLabels;
  return {
    routingId: routing.id,
    orderId: routing.order.id,
    orderNo: routing.order.orderNo,
    status,
    statusLabel: orderStatusLabels[status],
    amount: Number(routing.order.payableAmount),
    amountText: formatCurrency(Number(routing.order.payableAmount)),
    distance: Number(routing.distance),
    createdAt: routing.order.createdAt.toISOString(),
    address: `${routing.order.address.district}${routing.order.address.detail}`,
    customer: routing.order.customer.name,
    items: routing.order.items.map((item: { productName: string; quantity: number }) => ({
      name: item.productName,
      quantity: item.quantity,
    })),
  };
}

export async function getDealerLayoutData() {
  const dealer = await getDealerId();
  return {
    dealer: {
      id: dealer.id,
      name: dealer.shopName,
      zone: dealer.zone,
      phone: dealer.customer.phone,
      isAccepting: dealer.isAccepting,
    },
  };
}

export async function getIncomingOrders() {
  const dealer = await getDealerId("/dealer/incoming");
  const routings = await prisma.orderRouting.findMany({
    where: { dealerId: dealer.id, status: "PENDING" },
    include: {
      order: {
        include: {
          customer: { select: { name: true } },
          address: true,
          items: true,
        },
      },
    },
    orderBy: { assignedAt: "asc" },
  });

  return routings.map((routing) => mapRouting(routing));
}

export async function getDealerOrders() {
  const dealer = await getDealerId("/dealer/my-orders");
  const routings = await prisma.orderRouting.findMany({
    where: {
      dealerId: dealer.id,
      status: "ACCEPTED",
      order: { status: { in: ["CONFIRMED", "PAID", "SHIPPING", "DELIVERED", "COMPLETED"] } },
    },
    include: {
      order: {
        include: {
          customer: { select: { name: true } },
          address: true,
          items: true,
        },
      },
    },
    orderBy: { respondedAt: "desc" },
  });

  return routings.map((routing) => mapRouting(routing));
}

export async function getDealerSettlement() {
  const dealer = await getDealerId("/dealer/settlement");
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const routings = await prisma.orderRouting.findMany({
    where: {
      dealerId: dealer.id,
      status: "ACCEPTED",
      order: { status: "COMPLETED", updatedAt: { gte: start } },
    },
    include: {
      order: { include: { items: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const orders = routings.map((routing) => ({
    id: routing.order.id,
    orderNo: routing.order.orderNo,
    completedAt: routing.order.updatedAt.toISOString(),
    amount: Number(routing.order.payableAmount),
    settlementAmount: Number(routing.order.payableAmount) * 0.9,
  }));

  return {
    orders,
    completedCount: orders.length,
    totalAmount: orders.reduce((sum, order) => sum + order.amount, 0),
    settlementAmount: orders.reduce((sum, order) => sum + order.settlementAmount, 0),
  };
}
