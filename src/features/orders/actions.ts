"use server";

import type { OrderStatus, Prisma } from "@prisma/client";

import { requireDashboardPermission } from "@/features/auth/guards";
import { logAction } from "@/features/logs/audit";
import { routeOrderById } from "@/features/orders/routing";
import { manualOrderSchema, statusActionSchema, type ManualOrderInput } from "@/features/orders/schemas";
import type { ActionResult } from "@/features/orders/types";
import { buildOrderNoSequence, toMoney } from "@/features/orders/utils";
import { sendOrderStatusTemplate } from "@/features/wechat/official";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "@/lib/revalidate";

async function getOrderOperatorId(permission: "orders:write" | "orders:fulfill") {
  const user = await requireDashboardPermission(permission, permission === "orders:fulfill" ? "无权限执行订单履约操作" : "无权限维护订单");
  return user.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

async function generateOrderNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  return buildOrderNoSequence(count, now);
}

function revalidateOrderPaths(orderId?: string) {
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/records");
  revalidatePath("/dashboard/finance");
  revalidatePath("/shop/my-orders");
  if (orderId) {
    revalidatePath(`/dashboard/orders/${orderId}`);
    revalidatePath(`/shop/my-orders/${orderId}`);
  }
}

async function restoreOrderStock(tx: Prisma.TransactionClient, orderId: string, operatorId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });

  if (!order) {
    throw new Error("订单不存在");
  }

  if (order.status === "CANCELLED") {
    throw new Error("订单已取消");
  }

  for (const item of order.items) {
    const beforeStock = item.product.stock;
    const afterStock = beforeStock + item.quantity;
    await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: afterStock,
        salesCount: { decrement: Math.min(item.quantity, item.product.salesCount) },
        status: "ACTIVE",
      },
    });
    await tx.stockRecord.create({
      data: {
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        beforeStock,
        afterStock,
        relatedOrderId: order.id,
        operatorId,
        remark: `后台取消订单 ${order.orderNo} 回滚库存`,
      },
    });
  }
}

export async function updateOrderStatus(input: { orderId: string; action: "confirm" | "ship" | "deliver" | "complete" | "cancel" }): Promise<ActionResult> {
  const parsed = statusActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "状态操作不完整" } };
  }

  try {
    const operatorId = await getOrderOperatorId(["ship", "deliver", "complete"].includes(parsed.data.action) ? "orders:fulfill" : "orders:write");
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: parsed.data.orderId },
        select: { id: true, status: true, orderNo: true },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      let nextStatus: OrderStatus | null = null;
      if (parsed.data.action === "confirm") {
        if (!["PENDING_PAYMENT", "PAID"].includes(order.status)) throw new Error("当前状态不可确认");
        nextStatus = "CONFIRMED";
      }

      if (parsed.data.action === "ship") {
        if (!["PAID", "CONFIRMED"].includes(order.status)) throw new Error("当前状态不可发货");
        nextStatus = "SHIPPING";
        await tx.delivery.upsert({
          where: { orderId: order.id },
          update: { status: "SHIPPING", method: "自配送", shippedAt: new Date() },
          create: { orderId: order.id, status: "SHIPPING", method: "自配送", shippedAt: new Date() },
        });
      }

      if (parsed.data.action === "deliver") {
        if (order.status !== "SHIPPING") throw new Error("当前状态不可标记送达");
        nextStatus = "DELIVERED";
        await tx.delivery.upsert({
          where: { orderId: order.id },
          update: { status: "DELIVERED", deliveredAt: new Date() },
          create: { orderId: order.id, status: "DELIVERED", method: "自配送", deliveredAt: new Date() },
        });
      }

      if (parsed.data.action === "complete") {
        if (!["SHIPPING", "DELIVERED"].includes(order.status)) throw new Error("当前状态不可完成");
        nextStatus = "COMPLETED";
        await tx.delivery.upsert({
          where: { orderId: order.id },
          update: { status: "DELIVERED", deliveredAt: new Date() },
          create: { orderId: order.id, status: "DELIVERED", method: "自配送", deliveredAt: new Date() },
        });
      }

      if (parsed.data.action === "cancel") {
        if (!["PENDING_PAYMENT", "PAID", "CONFIRMED"].includes(order.status)) throw new Error("当前状态不可取消");
        await restoreOrderStock(tx, order.id, operatorId);
        nextStatus = "CANCELLED";
        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: { status: "CANCELLED" },
        });
        await tx.orderRouting.updateMany({
          where: { orderId: order.id, status: "PENDING" },
          data: { status: "EXPIRED", reason: "订单取消", respondedAt: new Date() },
        });
      }

      if (!nextStatus) {
        throw new Error("未知状态操作");
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus },
      });
    });

    await logAction({
      module: "订单",
      action: "更新订单状态",
      targetType: "Order",
      targetId: parsed.data.orderId,
      after: parsed.data,
      summary: `执行订单状态操作：${parsed.data.action}`,
    });
    revalidateOrderPaths(parsed.data.orderId);
    await sendOrderStatusTemplate(
      parsed.data.orderId,
      parsed.data.action === "ship"
        ? "shipped"
        : parsed.data.action === "deliver"
          ? "delivered"
          : parsed.data.action === "complete"
            ? "completed"
            : parsed.data.action === "cancel"
              ? "cancelled"
              : "updated",
    );
    return { success: true, message: "订单状态已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_ORDER_STATUS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createManualOrder(input: ManualOrderInput): Promise<ActionResult<{ orderId: string; orderNo: string }>> {
  const parsed = manualOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "订单信息不完整" } };
  }

  try {
    const operatorId = await getOrderOperatorId("orders:write");
    const order = await prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: parsed.data.addressId, customerId: parsed.data.customerId },
        select: { id: true, city: true },
      });

      if (!address) {
        throw new Error("客户收货地址不存在");
      }

      if (address.city !== "湘潭市") {
        throw new Error("当前仅支持湘潭市配送");
      }

      const productIds = parsed.data.items.map((item) => item.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map((product) => [product.id, product]));

      for (const item of parsed.data.items) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== "ACTIVE") throw new Error("商品不存在或已下架");
        if (product.stock < item.quantity) throw new Error(`${product.name} 库存不足`);
      }

      const totalAmount = parsed.data.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const isCredit = parsed.data.payMethod === "CREDIT";
      const orderNo = await generateOrderNo(tx);
      const created = await tx.order.create({
        data: {
          orderNo,
          customerId: parsed.data.customerId,
          type: parsed.data.type,
          source: "MANUAL",
          status: isCredit ? "CONFIRMED" : "PAID",
          totalAmount: toMoney(totalAmount),
          discountAmount: "0.00",
          payableAmount: toMoney(totalAmount),
          paidAmount: isCredit ? "0.00" : toMoney(totalAmount),
          payMethod: parsed.data.payMethod,
          addressId: parsed.data.addressId,
          remark: parsed.data.remark || "后台手动开单",
          routingType: "WAREHOUSE",
          salesPersonId: operatorId,
          items: {
            create: parsed.data.items.map((item) => {
              const product = productMap.get(item.productId);
              if (!product) throw new Error("商品不存在");
              return {
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                unitPrice: toMoney(item.unitPrice),
                quantity: item.quantity,
                totalAmount: toMoney(item.unitPrice * item.quantity),
              };
            }),
          },
          payments: {
            create: {
              customerId: parsed.data.customerId,
              type: "RECEIVE",
              amount: toMoney(totalAmount),
              method: parsed.data.payMethod,
              status: isCredit ? "PENDING" : "COMPLETED",
              dueDate: isCredit ? new Date(Date.now() + 30 * 86400000) : null,
              paidAt: isCredit ? null : new Date(),
              transactionId: isCredit ? null : `MANUAL-${orderNo}`,
              operatorId,
            },
          },
        },
        select: { id: true, orderNo: true },
      });

      for (const item of parsed.data.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error("商品不存在");
        const afterStock = product.stock - item.quantity;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: afterStock,
            salesCount: { increment: item.quantity },
            status: afterStock === 0 ? "OUT_OF_STOCK" : "ACTIVE",
          },
        });
        await tx.stockRecord.create({
          data: {
            productId: item.productId,
            type: "OUT",
            quantity: -item.quantity,
            beforeStock: product.stock,
            afterStock,
            relatedOrderId: created.id,
            operatorId,
            remark: `后台手动开单 ${orderNo} 出库`,
          },
        });
      }

      return { orderId: created.id, orderNo: created.orderNo };
    });

    await routeOrderById(order.orderId);
    await logAction({
      module: "订单",
      action: "手动开单",
      targetType: "Order",
      targetId: order.orderId,
      targetName: order.orderNo,
      after: order,
      summary: `创建手动订单 ${order.orderNo}`,
    });
    revalidateOrderPaths(order.orderId);
    return { success: true, message: "手动订单已创建", data: order };
  } catch (error) {
    return { success: false, error: { code: "CREATE_MANUAL_ORDER_FAILED", message: getErrorMessage(error) } };
  }
}
