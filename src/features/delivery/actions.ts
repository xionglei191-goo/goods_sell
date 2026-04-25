"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { sendOrderStatusTemplate } from "@/features/wechat/official";
import { prisma } from "@/lib/prisma";

const shipSchema = z.object({
  orderId: z.string().min(1),
  trackingNo: z.string().trim().min(1, "请填写物流单号"),
});

const orderSchema = z.object({
  orderId: z.string().min(1),
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateDelivery(orderId: string) {
  revalidatePath("/dashboard/delivery");
  revalidatePath(`/dashboard/delivery/${orderId}`);
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
}

export async function markOrderShipped(input: z.infer<typeof shipSchema>): Promise<ActionResult> {
  const parsed = shipSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "发货信息不完整" } };
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { id: true, orderNo: true, status: true } });
    if (!order) throw new Error("订单不存在");
    if (!["PAID", "CONFIRMED"].includes(order.status)) throw new Error("当前订单状态不可发货");

    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPING" } }),
      prisma.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "SHIPPING", method: "自配送", trackingNo: parsed.data.trackingNo, shippedAt: new Date() },
        create: { orderId: order.id, status: "SHIPPING", method: "自配送", trackingNo: parsed.data.trackingNo, shippedAt: new Date() },
      }),
    ]);

    await logAction({
      module: "配送",
      action: "标记发货",
      targetType: "Order",
      targetId: order.id,
      targetName: order.orderNo,
      before: order,
      after: { status: "SHIPPING", trackingNo: parsed.data.trackingNo },
      summary: `订单 ${order.orderNo} 已发货，物流单号 ${parsed.data.trackingNo}`,
    });
    await sendOrderStatusTemplate(order.id, "shipped");
    revalidateDelivery(order.id);
    return { success: true, message: "订单已标记发货" };
  } catch (error) {
    return { success: false, error: { code: "MARK_SHIPPED_FAILED", message: getErrorMessage(error) } };
  }
}

export async function markOrderDelivered(input: z.infer<typeof orderSchema>): Promise<ActionResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "订单 ID 不正确" } };
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId }, select: { id: true, orderNo: true, status: true } });
    if (!order) throw new Error("订单不存在");
    if (order.status !== "SHIPPING") throw new Error("当前订单状态不可送达");

    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } }),
      prisma.delivery.upsert({
        where: { orderId: order.id },
        update: { status: "DELIVERED", deliveredAt: new Date() },
        create: { orderId: order.id, status: "DELIVERED", method: "自配送", deliveredAt: new Date() },
      }),
    ]);

    await logAction({
      module: "配送",
      action: "确认送达",
      targetType: "Order",
      targetId: order.id,
      targetName: order.orderNo,
      before: order,
      after: { status: "DELIVERED" },
      summary: `订单 ${order.orderNo} 已确认送达`,
    });
    await sendOrderStatusTemplate(order.id, "delivered");
    revalidateDelivery(order.id);
    return { success: true, message: "订单已确认送达" };
  } catch (error) {
    return { success: false, error: { code: "MARK_DELIVERED_FAILED", message: getErrorMessage(error) } };
  }
}
