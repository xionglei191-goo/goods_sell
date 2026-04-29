"use server";

import type { LeadScene } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

  const dealer = await prisma.dealer.findUnique({ where: { customerId: session.user.id }, select: { id: true, shopName: true } });
  if (!dealer) {
    throw new Error("经销商档案不存在");
  }

  return dealer;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateDealerPaths(orderId?: string) {
  revalidatePath("/dealer/incoming");
  revalidatePath("/dealer/my-orders");
  revalidatePath("/dealer/settlement");
  revalidatePath("/dealer/promotion");
  revalidatePath("/dealer/leads");
  revalidatePath("/dashboard/orders");
  if (orderId) revalidatePath(`/dashboard/orders/${orderId}`);
}

const dealerPromoterScenes = new Set<LeadScene>(["BANQUET", "GROUP_BUY", "RESTOCK"]);

const dealerStockReportSchema = z.object({
  productId: z.string().trim().min(1, "请选择商品"),
  stock: z.coerce.number().int("库存必须是整数").min(0, "库存不能为负数").max(99999, "库存数量过大"),
});

const dealerPromoterSceneLabels: Record<Extract<LeadScene, "BANQUET" | "GROUP_BUY" | "RESTOCK">, string> = {
  BANQUET: "宴席配酒",
  GROUP_BUY: "企业团购",
  RESTOCK: "门店补货",
};

function normalizeDealerCode(scene: LeadScene) {
  return `DL${scene.slice(0, 2)}${Date.now().toString(36).toUpperCase().slice(-7)}`;
}

export async function createDealerPromoterCode(scene: LeadScene): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    if (!dealerPromoterScenes.has(scene)) {
      throw new Error("暂不支持该推广场景");
    }

    const dealer = await getDealerId();
    const existing = await prisma.promoterCode.findFirst({
      where: { dealerId: dealer.id, ownerType: "DEALER", scene, isActive: true },
      select: { id: true, code: true },
    });
    if (existing) {
      return { success: true, message: "该场景推广码已存在", data: existing };
    }

    const promoter = await prisma.promoterCode.create({
      data: {
        code: normalizeDealerCode(scene),
        ownerType: "DEALER",
        label: `${dealer.shopName} · ${dealerPromoterSceneLabels[scene as Extract<LeadScene, "BANQUET" | "GROUP_BUY" | "RESTOCK">]}`,
        scene,
        dealerId: dealer.id,
      },
      select: { id: true, code: true },
    });

    revalidatePath("/dealer/promotion");
    revalidatePath("/dashboard/promoters");
    return { success: true, message: "推广码已生成", data: promoter };
  } catch (error) {
    return { success: false, error: { code: "CREATE_DEALER_PROMOTER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function reportDealerStock(input: unknown): Promise<ActionResult> {
  try {
    const dealer = await getDealerId();
    const parsed = dealerStockReportSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "库存信息不完整");
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== "ACTIVE") {
      throw new Error("商品不存在或已下架");
    }

    await prisma.dealerStock.upsert({
      where: { dealerId_productId: { dealerId: dealer.id, productId: parsed.data.productId } },
      update: { stock: parsed.data.stock, reportedAt: new Date() },
      create: {
        dealerId: dealer.id,
        productId: parsed.data.productId,
        stock: parsed.data.stock,
      },
    });

    revalidatePath("/dealer/stock");
    revalidatePath("/dashboard/dealers");
    return { success: true, message: "库存已上报" };
  } catch (error) {
    return { success: false, error: { code: "REPORT_DEALER_STOCK_FAILED", message: getErrorMessage(error) } };
  }
}

export async function acceptRouting(routingId: string): Promise<ActionResult> {
  try {
    const dealer = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({
      where: { id: routingId, dealerId: dealer.id, status: "PENDING" },
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
    const dealer = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({
      where: { id: routingId, dealerId: dealer.id, status: "PENDING" },
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
    const dealer = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({ where: { orderId, dealerId: dealer.id, status: "ACCEPTED" }, select: { id: true } });
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
    const dealer = await getDealerId();
    const routing = await prisma.orderRouting.findFirst({ where: { orderId, dealerId: dealer.id, status: "ACCEPTED" }, select: { id: true } });
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
