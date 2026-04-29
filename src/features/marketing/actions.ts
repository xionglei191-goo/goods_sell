"use server";

import type { ProductPushStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { customerSegmentLabels, evaluateCustomerSegment } from "@/features/customers/segmentation";
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

const createProductPushSchema = z.object({
  productId: z.string().trim().min(1, "请选择新品"),
  targetTag: z.string().trim().min(1, "请选择画像标签"),
  message: z.string().trim().max(500, "推送话术不超过 500 字").optional(),
});

const productPushEventSchema = z.object({
  id: z.string().trim().min(1, "缺少推送记录"),
  event: z.enum(["SENT", "OPENED", "CONSULTED", "TRIAL", "ORDERED", "REPURCHASED", "CANCELLED"]),
});

export type CreateProductPushInput = z.infer<typeof createProductPushSchema>;
export type ProductPushEventInput = z.infer<typeof productPushEventSchema>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user.role || !staffRoles.has(session.user.role)) {
    throw new Error("无权限执行营销操作");
  }
}

function profileLabels(tags: unknown) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return [];
  const labels = (tags as { labels?: unknown }).labels;
  return Array.isArray(labels) ? labels.filter((item): item is string => typeof item === "string") : [];
}

function reasonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeTargetName(targetTag: string) {
  return targetTag.replace(/^画像:/, "").replace(/^客户分层:/, "");
}

function buildProductPushMessage(input: { customerName: string; productName: string; targetTag: string; category: string; brand: string; description?: string | null }) {
  const segment = normalizeTargetName(input.targetTag);
  const productIntro = input.description ? `，${input.description.slice(0, 48)}` : "";
  if (segment.includes("团购")) {
    return `${input.customerName}您好，${input.brand}${input.productName}${productIntro}，适合企业福利、节礼和批量采购。可给您单独核算组合价、开票和分批配送方案。`;
  }
  if (segment.includes("餐饮")) {
    return `${input.customerName}您好，${input.brand}${input.productName}${productIntro}，适合餐饮门店做高周转新品试饮。可先安排样品、动销建议和补货周期。`;
  }
  if (segment.includes("烟酒")) {
    return `${input.customerName}您好，${input.brand}${input.productName}${productIntro}，适合门店陈列和老客推荐。可咨询试饮、进货组合价和就近配送。`;
  }
  if (segment.includes("宴席")) {
    return `${input.customerName}您好，${input.brand}${input.productName}${productIntro}，适合宴席备货和临时补货。可按桌数、预算和配送时间给您配一套方案。`;
  }
  return `${input.customerName}您好，${input.brand}${input.productName}${productIntro}，这款${input.category}新品可咨询试饮、组合价和配送安排。`;
}

function eventLabel(event: ProductPushEventInput["event"]) {
  const labels: Record<ProductPushEventInput["event"], string> = {
    SENT: "已发送",
    OPENED: "已打开",
    CONSULTED: "已咨询",
    TRIAL: "已试饮",
    ORDERED: "已下单",
    REPURCHASED: "已复购",
    CANCELLED: "已取消",
  };
  return labels[event];
}

function statusFromEvent(event: ProductPushEventInput["event"]): ProductPushStatus {
  if (event === "CANCELLED") return "CANCELLED";
  if (event === "ORDERED" || event === "REPURCHASED") return "CONVERTED";
  if (event === "CONSULTED" || event === "TRIAL") return "CLICKED";
  if (event === "OPENED") return "OPENED";
  return "SENT";
}

function customerSegmentTag(customer: Parameters<typeof evaluateCustomerSegment>[0]) {
  const segment = evaluateCustomerSegment(customer).segment;
  return `客户分层:${customerSegmentLabels[segment]}`;
}

function customerTargetLabels(customer: Parameters<typeof evaluateCustomerSegment>[0]) {
  return Array.from(new Set([...customer.tags.map((tag) => tag.name), ...profileLabels(customer.profile?.tags), customerSegmentTag(customer)]));
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

export async function createProductPush(input: CreateProductPushInput): Promise<ActionResult<{ count: number }>> {
  try {
    await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = createProductPushSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "新品推送信息不完整" } };
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      include: { brand: { select: { name: true } }, category: { select: { name: true } } },
    });
    if (!product || product.status !== "ACTIVE") {
      throw new Error("新品不存在或已下架");
    }

    const customers = await prisma.customer.findMany({
      include: {
        profile: { select: { tags: true } },
        tags: true,
        orders: { where: { parentId: null }, select: { type: true, status: true, payableAmount: true, createdAt: true } },
        leads: { select: { scene: true, metadata: true, notes: true, createdAt: true } },
        inquiries: { select: { scene: true, budget: true, content: true, notes: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const targets = customers.filter((customer) => {
      const labels = customerTargetLabels(customer);
      return labels.includes(parsed.data.targetTag);
    });
    if (targets.length === 0) {
      return { success: false, error: { code: "NO_TARGETS", message: "该画像标签下暂无可推送客户" } };
    }

    const existing = await prisma.productPush.findMany({
      where: {
        productId: product.id,
        targetTag: parsed.data.targetTag,
        customerId: { in: targets.map((customer) => customer.id) },
      },
      select: { customerId: true },
    });
    const existingCustomerIds = new Set(existing.map((item) => item.customerId).filter((id): id is string => Boolean(id)));
    const selected = targets.filter((customer) => !existingCustomerIds.has(customer.id)).slice(0, 80);
    if (selected.length === 0) {
      return { success: false, error: { code: "NO_NEW_TARGETS", message: "该新品已覆盖当前画像客户" } };
    }

    const now = new Date();
    await prisma.productPush.createMany({
      data: selected.map((customer) => {
        const labels = customerTargetLabels(customer);
        return {
          productId: product.id,
          customerId: customer.id,
          targetTag: parsed.data.targetTag,
          status: "SENT",
          message:
            parsed.data.message ||
            buildProductPushMessage({
              customerName: customer.name,
              productName: product.name,
              targetTag: parsed.data.targetTag,
              category: product.category.name,
              brand: product.brand.name,
              description: product.description,
            }),
          sentAt: now,
          reason: {
            targetTag: parsed.data.targetTag,
            matchedLabels: Array.from(new Set(labels)),
            productName: product.name,
            generatedAt: now.toISOString(),
            events: [{ event: "SENT", label: eventLabel("SENT"), at: now.toISOString() }],
          },
        };
      }),
    });

    revalidatePath("/dashboard/product-pushes");
    revalidatePath("/dashboard/marketing/operations");
    return { success: true, message: `已生成 ${selected.length} 条新品推送`, data: { count: selected.length } };
  } catch (error) {
    return { success: false, error: { code: "CREATE_PRODUCT_PUSH_FAILED", message: getErrorMessage(error) } };
  }
}

export async function recordProductPushEvent(input: ProductPushEventInput): Promise<ActionResult> {
  try {
    await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = productPushEventSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "推送事件信息不完整" } };
  }

  try {
    const push = await prisma.productPush.findUnique({ where: { id: parsed.data.id }, select: { reason: true } });
    if (!push) throw new Error("推送记录不存在");

    const now = new Date();
    const reason = reasonObject(push.reason);
    const events = Array.isArray(reason.events) ? reason.events : [];
    const eventItem = { event: parsed.data.event, label: eventLabel(parsed.data.event), at: now.toISOString() };
    const data = {
      status: statusFromEvent(parsed.data.event),
      reason: { ...reason, events: [...events, eventItem] },
      ...(parsed.data.event === "SENT" ? { sentAt: now } : {}),
      ...(parsed.data.event === "OPENED" ? { openedAt: now } : {}),
      ...(parsed.data.event === "CONSULTED" || parsed.data.event === "TRIAL" ? { clickedAt: now } : {}),
      ...(parsed.data.event === "ORDERED" || parsed.data.event === "REPURCHASED" ? { convertedAt: now } : {}),
    };

    await prisma.productPush.update({
      where: { id: parsed.data.id },
      data,
    });

    revalidatePath("/dashboard/product-pushes");
    revalidatePath("/dashboard/marketing/operations");
    return { success: true, message: eventItem.label };
  } catch (error) {
    return { success: false, error: { code: "RECORD_PRODUCT_PUSH_EVENT_FAILED", message: getErrorMessage(error) } };
  }
}
