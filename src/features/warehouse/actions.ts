"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import { prisma } from "@/lib/prisma";

const safeStockSchema = z.object({
  productId: z.string().min(1),
  safeStock: z.coerce.number().int().min(0).max(999999),
});

const confirmSchema = z.object({
  stockCheckId: z.string().min(1),
  items: z.array(z.object({ itemId: z.string().min(1), actualStock: z.coerce.number().int().min(0), remark: z.string().optional() })).min(1),
});

async function getOperatorId() {
  const session = await auth();
  if (session?.user.id && session.user.type === "STAFF") return session.user.id;
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("未找到可用操作员");
  return admin.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateWarehouse() {
  revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
  revalidatePath("/dashboard/warehouse");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/records");
  revalidatePath("/shop");
  revalidatePath("/shop/catalog");
}

function formatCheckNo(date: Date) {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `SC${day}`;
}

export async function updateSafeStock(input: z.infer<typeof safeStockSchema>): Promise<ActionResult> {
  const parsed = safeStockSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "安全库存不正确" } };
  }

  try {
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: parsed.data.productId },
      select: { id: true, name: true, safeStock: true },
    });
    const product = await prisma.product.update({
      where: { id: parsed.data.productId },
      data: { safeStock: parsed.data.safeStock },
      select: { id: true, name: true, safeStock: true },
    });
    await logAction({
      module: "库存",
      action: "更新安全库存",
      targetType: "Product",
      targetId: product.id,
      targetName: product.name,
      before,
      after: product,
      summary: `${product.name} 安全库存 ${before.safeStock} → ${product.safeStock}`,
    });
    revalidateWarehouse();
    return { success: true, message: "安全库存已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_SAFE_STOCK_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createStockCheck(): Promise<ActionResult<{ id: string; checkNo: string }>> {
  try {
    const operatorId = await getOperatorId();
    const today = new Date();
    const prefix = formatCheckNo(today);
    const count = await prisma.stockCheck.count({ where: { checkNo: { startsWith: prefix } } });
    const checkNo = `${prefix}${String(count + 1).padStart(3, "0")}`;
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      select: { id: true, stock: true },
    });

    const check = await prisma.stockCheck.create({
      data: {
        checkNo,
        operatorId,
        remark: "Phase 6 仓储作业创建",
        items: {
          create: products.map((product) => ({
            productId: product.id,
            systemStock: product.stock,
            actualStock: product.stock,
            difference: 0,
          })),
        },
      },
      select: { id: true, checkNo: true },
    });

    await logAction({
      module: "库存",
      action: "新建盘点",
      targetType: "StockCheck",
      targetId: check.id,
      targetName: check.checkNo,
      after: { itemCount: products.length },
      summary: `创建盘点任务 ${check.checkNo}，共 ${products.length} 个 SKU`,
    });
    revalidateWarehouse();
    return { success: true, message: "盘点任务已创建", data: check };
  } catch (error) {
    return { success: false, error: { code: "CREATE_STOCK_CHECK_FAILED", message: getErrorMessage(error) } };
  }
}

export async function confirmStockCheck(input: z.infer<typeof confirmSchema>): Promise<ActionResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "盘点明细不完整" } };
  }

  try {
    const operatorId = await getOperatorId();
    const result = await prisma.$transaction(async (tx) => {
      const check = await tx.stockCheck.findUnique({
        where: { id: parsed.data.stockCheckId },
        include: { items: { include: { product: true } } },
      });
      if (!check) throw new Error("盘点任务不存在");
      if (check.status !== "DRAFT") throw new Error("盘点任务已确认或已取消");

      const actualMap = new Map(parsed.data.items.map((item) => [item.itemId, item]));
      let adjusted = 0;

      for (const item of check.items) {
        const submitted = actualMap.get(item.id);
        if (!submitted) continue;
        const actualStock = submitted.actualStock;
        const difference = actualStock - item.systemStock;
        await tx.stockCheckItem.update({
          where: { id: item.id },
          data: { actualStock, difference, remark: submitted.remark || null },
        });

        if (difference !== 0) {
          adjusted += 1;
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: actualStock,
              status: actualStock === 0 ? "OUT_OF_STOCK" : "ACTIVE",
            },
          });
          await tx.stockRecord.create({
            data: {
              productId: item.productId,
              type: "CHECK",
              quantity: difference,
              beforeStock: item.product.stock,
              afterStock: actualStock,
              operatorId,
              remark: `盘点 ${check.checkNo} 调整`,
            },
          });
        }
      }

      await tx.stockCheck.update({
        where: { id: check.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });

      return { checkNo: check.checkNo, adjusted };
    });

    await logAction({
      module: "库存",
      action: "确认盘点",
      targetType: "StockCheck",
      targetId: parsed.data.stockCheckId,
      targetName: result.checkNo,
      after: result,
      summary: `确认盘点 ${result.checkNo}，调整 ${result.adjusted} 个 SKU`,
    });
    revalidateWarehouse();
    revalidatePath(`/dashboard/warehouse/checks/${parsed.data.stockCheckId}`);
    return { success: true, message: "盘点已确认，库存已调整" };
  } catch (error) {
    return { success: false, error: { code: "CONFIRM_STOCK_CHECK_FAILED", message: getErrorMessage(error) } };
  }
}
