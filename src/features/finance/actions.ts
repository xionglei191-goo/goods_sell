"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { toMoney } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

const paymentSchema = z.object({
  customerId: z.string().min(1),
  method: z.enum(["WECHAT", "CASH", "TRANSFER"]),
  allocations: z.array(z.object({ orderId: z.string().min(1), amount: z.coerce.number().min(0.01) })).min(1),
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

export async function registerPayment(input: z.infer<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "收款信息不完整" } };
  }

  try {
    const operatorId = await getOperatorId();
    await prisma.$transaction(async (tx) => {
      for (const allocation of parsed.data.allocations) {
        const order = await tx.order.findFirst({
          where: { id: allocation.orderId, customerId: parsed.data.customerId },
          select: { id: true, payableAmount: true, paidAmount: true, status: true },
        });

        if (!order) throw new Error("订单不存在");
        const remaining = Math.max(0, Number(order.payableAmount) - Number(order.paidAmount));
        if (allocation.amount > remaining) throw new Error("收款金额不能超过剩余应收");
        const nextPaid = Number(order.paidAmount) + allocation.amount;
        const fullyPaid = nextPaid >= Number(order.payableAmount);

        await tx.payment.create({
          data: {
            orderId: order.id,
            customerId: parsed.data.customerId,
            type: "RECEIVE",
            amount: toMoney(allocation.amount),
            method: parsed.data.method,
            status: "COMPLETED",
            paidAt: new Date(),
            operatorId,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: {
            paidAmount: toMoney(nextPaid),
            status: fullyPaid && order.status === "PENDING_PAYMENT" ? "PAID" : order.status,
          },
        });
      }
    });

    await logAction({
      module: "收款",
      action: "登记收款",
      targetType: "Payment",
      targetId: parsed.data.customerId,
      after: parsed.data,
      summary: `登记收款 ${parsed.data.allocations.reduce((sum, item) => sum + item.amount, 0).toFixed(2)} 元`,
    });
    revalidatePath("/dashboard/finance");
    revalidatePath("/dashboard/finance/receivable");
    revalidatePath("/dashboard/finance/payments");
    revalidatePath("/dashboard/finance/statements");
    revalidatePath("/dashboard/orders");
    return { success: true, message: "收款已登记" };
  } catch (error) {
    return { success: false, error: { code: "REGISTER_PAYMENT_FAILED", message: getErrorMessage(error) } };
  }
}
