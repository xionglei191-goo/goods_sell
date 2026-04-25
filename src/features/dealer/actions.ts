"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { rejectAndRematchRouting } from "@/features/orders/routing";
import type { ActionResult } from "@/features/orders/types";
import { sendOrderStatusTemplate } from "@/features/wechat/official";
import { prisma } from "@/lib/prisma";

async function getDealerId() {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "DEALER") {
    throw new Error("请使用经销商账号登录");
  }

  const dealer = await prisma.dealer.findUnique({ where: { customerId: session.user.id }, select: { id: true } });
  if (!dealer) {
    throw new Error("经销商档案不存在");
  }

  return dealer.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateDealerPaths(orderId?: string) {
  revalidatePath("/dealer/incoming");
  revalidatePath("/dealer/my-orders");
  revalidatePath("/dealer/settlement");
  revalidatePath("/dashboard/orders");
  if (orderId) revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function acceptRouting(routingId: string): Promise<ActionResult> {
  try {
    const dealerId = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({
      where: { id: routingId, dealerId, status: "PENDING" },
      select: { id: true, orderId: true, order: { select: { status: true } } },
    });

    if (!routing) {
      throw new Error("待接订单不存在");
    }

    await prisma.$transaction([
      prisma.orderRouting.update({
        where: { id: routing.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      prisma.order.update({
        where: { id: routing.orderId },
        data: { status: routing.order.status === "PAID" ? "CONFIRMED" : routing.order.status },
      }),
    ]);

    revalidateDealerPaths(routing.orderId);
    return { success: true, message: "已接单" };
  } catch (error) {
    return { success: false, error: { code: "ACCEPT_ROUTING_FAILED", message: getErrorMessage(error) } };
  }
}

export async function rejectRouting(routingId: string, reason: string): Promise<ActionResult> {
  try {
    const dealerId = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({
      where: { id: routingId, dealerId, status: "PENDING" },
      select: { id: true, orderId: true },
    });

    if (!routing) {
      throw new Error("待接订单不存在");
    }

    await rejectAndRematchRouting(routing.id, reason || "经销商拒单");
    revalidateDealerPaths(routing.orderId);
    return { success: true, message: "已拒单并自动重匹配" };
  } catch (error) {
    return { success: false, error: { code: "REJECT_ROUTING_FAILED", message: getErrorMessage(error) } };
  }
}

export async function shipDealerOrder(orderId: string): Promise<ActionResult> {
  try {
    const dealerId = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({ where: { orderId, dealerId, status: "ACCEPTED" }, select: { id: true } });
    if (!routing) throw new Error("订单不属于当前经销商");

    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status: "SHIPPING" } }),
      prisma.delivery.upsert({
        where: { orderId },
        update: { status: "SHIPPING", method: "经销商自配送", shippedAt: new Date() },
        create: { orderId, status: "SHIPPING", method: "经销商自配送", shippedAt: new Date() },
      }),
    ]);

    revalidateDealerPaths(orderId);
    await sendOrderStatusTemplate(orderId, "shipped");
    return { success: true, message: "已确认发货" };
  } catch (error) {
    return { success: false, error: { code: "SHIP_ORDER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function completeDealerOrder(orderId: string): Promise<ActionResult> {
  try {
    const dealerId = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({ where: { orderId, dealerId, status: "ACCEPTED" }, select: { id: true } });
    if (!routing) throw new Error("订单不属于当前经销商");

    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } }),
      prisma.delivery.upsert({
        where: { orderId },
        update: { status: "DELIVERED", deliveredAt: new Date() },
        create: { orderId, status: "DELIVERED", method: "经销商自配送", deliveredAt: new Date() },
      }),
    ]);

    revalidateDealerPaths(orderId);
    await sendOrderStatusTemplate(orderId, "completed");
    return { success: true, message: "订单已完成" };
  } catch (error) {
    return { success: false, error: { code: "COMPLETE_ORDER_FAILED", message: getErrorMessage(error) } };
  }
}
