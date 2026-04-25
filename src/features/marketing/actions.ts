"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import type { ActionResult } from "@/features/orders/types";
import { toMoney } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

const staffRoles = new Set(["ADMIN", "SALESPERSON", "FINANCE"]);

const couponSchema = z
  .object({
    name: z.string().trim().min(2, "优惠券名称至少 2 个字符"),
    type: z.enum(["AMOUNT", "PERCENT"]),
    amount: z.coerce.number().optional(),
    percent: z.coerce.number().optional(),
    threshold: z.coerce.number().min(0, "门槛不能小于 0"),
    totalQuantity: z.coerce.number().int().min(1, "发放数量至少 1 张"),
    startsAt: z.string().min(1, "请选择开始日期"),
    endsAt: z.string().min(1, "请选择结束日期"),
  })
  .superRefine((data, ctx) => {
    if (data.type === "AMOUNT" && (!data.amount || data.amount <= 0)) {
      ctx.addIssue({ code: "custom", message: "满减券面额必须大于 0", path: ["amount"] });
    }

    if (data.type === "PERCENT" && (!data.percent || data.percent <= 0 || data.percent >= 10)) {
      ctx.addIssue({ code: "custom", message: "折扣需大于 0 且小于 10", path: ["percent"] });
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
      ctx.addIssue({ code: "custom", message: "结束日期不能早于开始日期", path: ["endsAt"] });
    }
  });

export type CouponInput = z.infer<typeof couponSchema>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user.role || !staffRoles.has(session.user.role)) {
    throw new Error("无权限执行营销操作");
  }
}

export async function createCoupon(input: CouponInput): Promise<ActionResult> {
  try {
    await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "优惠券信息不完整" } };
  }

  try {
    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    startsAt.setHours(0, 0, 0, 0);
    endsAt.setHours(23, 59, 59, 999);

    await prisma.coupon.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        amount: parsed.data.type === "AMOUNT" ? toMoney(parsed.data.amount ?? 0) : null,
        percent: parsed.data.type === "PERCENT" ? toMoney(parsed.data.percent ?? 0) : null,
        threshold: toMoney(parsed.data.threshold),
        totalQuantity: parsed.data.totalQuantity,
        startsAt,
        endsAt,
      },
    });
    revalidatePath("/dashboard/marketing/coupons");
    revalidatePath("/dashboard/marketing/operations");
    return { success: true, message: "优惠券已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_COUPON_FAILED", message: getErrorMessage(error) } };
  }
}

export async function issueCouponByTag(couponId: string, tag: string): Promise<ActionResult<{ count: number }>> {
  try {
    await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  try {
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
    const customers = await prisma.customer.findMany({ include: { profile: true, tags: true, coupons: true } });
    const targets = customers.filter((customer) => {
      const profileLabels = customer.profile?.tags && typeof customer.profile.tags === "object" ? ((customer.profile.tags as { labels?: string[] }).labels ?? []) : [];
      const labels = [...customer.tags.map((item) => item.name), ...profileLabels];
      return labels.includes(tag) && !customer.coupons.some((item) => item.couponId === couponId);
    });
    const available = Math.max(0, coupon.totalQuantity - coupon.issuedQuantity);
    const selected = targets.slice(0, available);
    if (selected.length === 0) {
      return { success: false, error: { code: "NO_TARGETS", message: "没有可发放的目标客户或库存不足" } };
    }

    await prisma.$transaction([
      prisma.customerCoupon.createMany({
        data: selected.map((customer) => ({ customerId: customer.id, couponId })),
        skipDuplicates: true,
      }),
      prisma.coupon.update({ where: { id: couponId }, data: { issuedQuantity: { increment: selected.length } } }),
    ]);

    revalidatePath("/dashboard/marketing/coupons");
    revalidatePath("/dashboard/marketing/operations");
    revalidatePath("/shop/coupons");
    return { success: true, message: `已发放 ${selected.length} 张优惠券`, data: { count: selected.length } };
  } catch (error) {
    return { success: false, error: { code: "ISSUE_COUPON_FAILED", message: getErrorMessage(error) } };
  }
}
