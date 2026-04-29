"use server";

import { StockType } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireDashboardPermission } from "@/features/auth/guards";
import { stockMovementSchema, type StockMovementInput } from "@/features/inventory/schemas";
import { logAction } from "@/features/logs/audit";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: { code: string; message: string } };

async function getOperatorId() {
  const user = await requireDashboardPermission("inventory:manage", "无权限执行库存操作");
  return user.id;
}

function parseMovement(input: StockMovementInput) {
  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, message: parsed.error.issues[0]?.message ?? "库存操作信息不完整" };
  }

  return { success: true as const, data: parsed.data };
}

function revalidateInventoryViews() {
  revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
  revalidatePath("/shop");
  revalidatePath("/shop/catalog");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/records");
}

export async function stockIn(input: StockMovementInput): Promise<ActionResult> {
  const parsed = parseMovement(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.message } };
  }

  try {
    const operatorId = await getOperatorId();
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: parsed.data.productId },
        select: { id: true, name: true, stock: true },
      });

      if (!product) {
        throw new Error("产品不存在");
      }

      const afterStock = product.stock + parsed.data.quantity;
      await tx.product.update({
        where: { id: parsed.data.productId },
        data: { stock: afterStock, status: "ACTIVE" },
      });
      await tx.stockRecord.create({
        data: {
          productId: parsed.data.productId,
          type: StockType.IN,
          quantity: parsed.data.quantity,
          beforeStock: product.stock,
          afterStock,
          operatorId,
          remark: parsed.data.remark || "入库",
        },
      });
    });

    await logAction({
      module: "库存",
      action: "入库",
      targetType: "Product",
      targetId: parsed.data.productId,
      after: parsed.data,
      summary: `商品入库 ${parsed.data.quantity} 件`,
    });
    revalidateInventoryViews();
    return { success: true, message: "入库成功" };
  } catch (error) {
    return { success: false, error: { code: "STOCK_IN_FAILED", message: error instanceof Error ? error.message : "入库失败" } };
  }
}

export async function stockOut(input: StockMovementInput): Promise<ActionResult> {
  const parsed = parseMovement(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.message } };
  }

  try {
    const operatorId = await getOperatorId();
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: parsed.data.productId },
        select: { id: true, name: true, stock: true },
      });

      if (!product) {
        throw new Error("产品不存在");
      }

      if (product.stock < parsed.data.quantity) {
        throw new Error("库存不足");
      }

      const afterStock = product.stock - parsed.data.quantity;
      await tx.product.update({
        where: { id: parsed.data.productId },
        data: {
          stock: afterStock,
          status: afterStock === 0 ? "OUT_OF_STOCK" : "ACTIVE",
        },
      });
      await tx.stockRecord.create({
        data: {
          productId: parsed.data.productId,
          type: StockType.OUT,
          quantity: -parsed.data.quantity,
          beforeStock: product.stock,
          afterStock,
          operatorId,
          remark: parsed.data.remark || "出库",
        },
      });
    });

    await logAction({
      module: "库存",
      action: "出库",
      targetType: "Product",
      targetId: parsed.data.productId,
      after: parsed.data,
      summary: `商品出库 ${parsed.data.quantity} 件`,
    });
    revalidateInventoryViews();
    return { success: true, message: "出库成功" };
  } catch (error) {
    return { success: false, error: { code: "STOCK_OUT_FAILED", message: error instanceof Error ? error.message : "出库失败" } };
  }
}
