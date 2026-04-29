"use server";

import { PurchaseStatus, StockType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireDashboardPermission } from "@/features/auth/guards";
import { purchaseOrderSchema, supplierSchema, type PurchaseOrderInput, type SupplierInput } from "@/features/purchase/schemas";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: { code: string; message: string } };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

async function getOperatorId() {
  const user = await requireDashboardPermission("purchase:manage", "无权限执行采购操作");
  return user.id;
}

function nextPurchaseNo() {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `PO${date}${String(now.getTime()).slice(-6)}`;
}

export async function createSupplier(input: SupplierInput): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "供应商信息不完整" } };
  }

  try {
    await requireDashboardPermission("purchase:manage", "无权限维护供应商");
    await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        contactName: parsed.data.contactName || null,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
      },
    });
    revalidatePath("/dashboard/purchase/suppliers");
    return { success: true, message: "供应商已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_SUPPLIER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "供应商信息不完整" } };
  }

  try {
    await requireDashboardPermission("purchase:manage", "无权限维护供应商");
    await prisma.supplier.update({
      where: { id },
      data: {
        name: parsed.data.name,
        contactName: parsed.data.contactName || null,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
      },
    });
    revalidatePath("/dashboard/purchase/suppliers");
    return { success: true, message: "供应商已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_SUPPLIER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    await requireDashboardPermission("purchase:manage", "无权限维护供应商");
    const purchaseCount = await prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (purchaseCount > 0) {
      return { success: false, error: { code: "SUPPLIER_IN_USE", message: `该供应商已有 ${purchaseCount} 张采购单，无法删除` } };
    }
    await prisma.supplier.delete({ where: { id } });
    revalidatePath("/dashboard/purchase/suppliers");
    return { success: true, message: "供应商已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_SUPPLIER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createPurchaseOrder(input: PurchaseOrderInput): Promise<ActionResult> {
  const parsed = purchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "采购信息不完整" } };
  }

  try {
    const operatorId = await getOperatorId();
    const totalAmount = parsed.data.quantity * parsed.data.unitCost;
    await prisma.purchaseOrder.create({
      data: {
        purchaseNo: nextPurchaseNo(),
        supplierId: parsed.data.supplierId,
        status: PurchaseStatus.SUBMITTED,
        totalAmount: totalAmount.toFixed(2),
        remark: parsed.data.remark || null,
        createdById: operatorId,
        submittedAt: new Date(),
        items: {
          create: {
            productId: parsed.data.productId,
            quantity: parsed.data.quantity,
            unitCost: parsed.data.unitCost.toFixed(2),
            totalAmount: totalAmount.toFixed(2),
          },
        },
      },
    });
    revalidatePath("/dashboard/purchase");
    return { success: true, message: "采购单已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_PURCHASE_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updatePurchaseStatus(id: string, status: PurchaseStatus): Promise<ActionResult> {
  try {
    await requireDashboardPermission("purchase:manage", "无权限更新采购状态");
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        submittedAt: status === "SUBMITTED" ? new Date() : undefined,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
      },
    });
    revalidatePath("/dashboard/purchase");
    return { success: true, message: "采购状态已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_PURCHASE_FAILED", message: getErrorMessage(error) } };
  }
}

export async function receivePurchaseOrder(id: string): Promise<ActionResult> {
  try {
    const operatorId = await getOperatorId();
    await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!purchase) {
        throw new Error("采购单不存在");
      }

      if (purchase.status === "COMPLETED") {
        throw new Error("采购单已完成，不能重复收货");
      }

      for (const item of purchase.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stock: true },
        });
        if (!product) {
          throw new Error("采购单包含不存在的产品");
        }

        const afterStock = product.stock + item.quantity;
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: afterStock, status: "ACTIVE" },
        });
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity },
        });
        await tx.stockRecord.create({
          data: {
            productId: item.productId,
            type: StockType.IN,
            quantity: item.quantity,
            beforeStock: product.stock,
            afterStock,
            operatorId,
            remark: `采购收货：${purchase.purchaseNo}`,
          },
        });
      }

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseStatus.COMPLETED,
          receivedAt: new Date(),
          completedAt: new Date(),
        },
      });
    });

    revalidatePath("/dashboard/purchase");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/records");
    return { success: true, message: "采购收货完成，库存已增加" };
  } catch (error) {
    return { success: false, error: { code: "RECEIVE_PURCHASE_FAILED", message: getErrorMessage(error) } };
  }
}
