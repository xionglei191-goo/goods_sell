"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDashboardPermission } from "@/features/auth/guards";
import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { toMoney } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

const invoiceSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(["NORMAL", "SPECIAL"]),
  buyerName: z.string().trim().min(1, "请填写购方名称"),
  buyerTaxNo: z.string().trim().optional(),
  buyerAddress: z.string().trim().optional(),
  buyerPhone: z.string().trim().optional(),
  buyerBank: z.string().trim().optional(),
  buyerBankAccount: z.string().trim().optional(),
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

async function generateInvoiceNo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const count = await prisma.invoice.count({ where: { invoiceNo: { startsWith: `FP${date}` } } });
  return `FP${date}${String(count + 1).padStart(6, "0")}`;
}

export async function issueInvoice(input: z.infer<typeof invoiceSchema>): Promise<ActionResult<{ invoiceNo: string }>> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "发票信息不完整" } };
  }

  try {
    await requireDashboardPermission("receipts:manage", "无权限开具票据");
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: true,
        payments: { where: { status: "COMPLETED", type: "RECEIVE" }, orderBy: { paidAt: "desc" }, take: 1 },
        invoices: { select: { id: true } },
      },
    });
    if (!order) throw new Error("订单不存在");
    if (order.invoices.length > 0) throw new Error("该订单已开票");
    if (Number(order.paidAmount) <= 0) throw new Error("订单未收款，无法开票");

    const invoiceNo = await generateInvoiceNo();
    const amount = Number(order.paidAmount);
    const taxAmount = amount - amount / 1.06;
    const provider = process.env.TAX_PROVIDER?.trim() || "MOCK";
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo,
        type: parsed.data.type,
        status: "ISSUED",
        provider,
        customerId: order.customerId,
        orderId: order.id,
        paymentId: order.payments[0]?.id ?? null,
        buyerName: parsed.data.buyerName,
        buyerTaxNo: parsed.data.buyerTaxNo || null,
        buyerAddress: parsed.data.buyerAddress || null,
        buyerPhone: parsed.data.buyerPhone || null,
        buyerBank: parsed.data.buyerBank || null,
        buyerBankAccount: parsed.data.buyerBankAccount || null,
        amount: toMoney(amount),
        taxAmount: toMoney(taxAmount),
        content: {
          mode: provider === "MOCK" ? "MOCK" : "TAX_API_READY",
          orderNo: order.orderNo,
          items: order.items.map((item) => ({
            name: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            totalAmount: Number(item.totalAmount),
          })),
        },
      },
      select: { id: true, invoiceNo: true },
    });

    await logAction({
      module: "票据",
      action: "开具发票",
      targetType: "Invoice",
      targetId: invoice.id,
      targetName: invoice.invoiceNo,
      after: { orderNo: order.orderNo, amount, provider },
      summary: `订单 ${order.orderNo} 开具发票 ${invoice.invoiceNo}`,
    });
    revalidatePath("/dashboard/receipts");
    return { success: true, message: provider === "MOCK" ? "Mock 发票已开具" : "发票已开具", data: { invoiceNo: invoice.invoiceNo } };
  } catch (error) {
    return { success: false, error: { code: "ISSUE_INVOICE_FAILED", message: getErrorMessage(error) } };
  }
}
