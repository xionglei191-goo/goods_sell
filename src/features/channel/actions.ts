"use server";

import type { LeadScene, LeadSource, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { createPromoterCodeSchema, createQuoteSchema, dealerPolicySchema, scenarioInquirySchema } from "@/features/channel/schemas";
import { toMoney } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type ActionResult<T = unknown> =
  | { success: true; message?: string; data?: T }
  | { success: false; error: { code: string; message: string } };

const staffRoles = new Set(["ADMIN", "SALESPERSON", "FINANCE"]);

function formatDateSequence(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

async function requireStaff() {
  const session = await auth();
  if (!session?.user.id || !session.user.role || !staffRoles.has(session.user.role)) {
    throw new Error("无权限执行渠道经营操作");
  }
  return session.user.id;
}

async function buildInquiryNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.inquiry.count({ where: { createdAt: { gte: start } } });
  return `XJ${formatDateSequence(now)}${String(count + 1).padStart(5, "0")}`;
}

async function buildQuoteNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.quote.count({ where: { createdAt: { gte: start } } });
  return `BJ${formatDateSequence(now)}${String(count + 1).padStart(5, "0")}`;
}

function normalizeExpectedDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeOptionalDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sourceFromPromoter(ownerType: "SALESPERSON" | "DEALER" | "CAMPAIGN" | undefined, fallback: LeadSource) {
  if (ownerType === "SALESPERSON") return "SALESPERSON_CODE";
  if (ownerType === "DEALER") return "DEALER_CODE";
  return fallback;
}

function normalizePromoterCode(value: string | undefined, ownerType: "SALESPERSON" | "DEALER" | "CAMPAIGN") {
  const manual = value?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (manual) return manual;
  const prefix = ownerType === "SALESPERSON" ? "SP" : ownerType === "DEALER" ? "DL" : "CP";
  return `${prefix}${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

export async function createScenarioInquiry(input: unknown): Promise<ActionResult<{ inquiryNo: string; inquiryId: string; leadId: string }>> {
  const parsed = scenarioInquirySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "请补充完整信息",
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const promoter = parsed.data.promoterCode
        ? await tx.promoterCode.findUnique({
            where: { code: parsed.data.promoterCode },
            select: { id: true, ownerType: true, salespersonId: true, dealerId: true, isActive: true },
          })
        : null;
      const customer = await tx.customer.findUnique({
        where: { phone: parsed.data.contactPhone },
        select: { id: true, salesPersonId: true, dealer: { select: { id: true } } },
      });
      const source = sourceFromPromoter(promoter?.isActive ? promoter.ownerType : undefined, parsed.data.source);
      const salespersonId = promoter?.isActive ? promoter.salespersonId : customer?.salesPersonId ?? null;
      const dealerId = promoter?.isActive ? promoter.dealerId : customer?.dealer?.id ?? null;
      const inquiryNo = await buildInquiryNo(tx);
      const metadata = {
        fields: parsed.data.fields,
        promoterCode: parsed.data.promoterCode ?? null,
        expectedDate: parsed.data.expectedDate ?? null,
      };
      const lead = await tx.lead.create({
        data: {
          source,
          scene: parsed.data.scene as LeadScene,
          status: salespersonId || dealerId ? "ASSIGNED" : "NEW",
          name: parsed.data.contactName,
          phone: parsed.data.contactPhone,
          customerId: customer?.id ?? null,
          salespersonId,
          dealerId,
          promoterCodeId: promoter?.isActive ? promoter.id : null,
          notes: parsed.data.notes || null,
          metadata,
          consentAccepted: parsed.data.consentAccepted,
        },
        select: { id: true },
      });
      const inquiry = await tx.inquiry.create({
        data: {
          inquiryNo,
          scene: parsed.data.scene as LeadScene,
          status: salespersonId ? "ASSIGNED" : "NEW",
          leadId: lead.id,
          customerId: customer?.id ?? null,
          salespersonId,
          dealerId,
          contactName: parsed.data.contactName,
          contactPhone: parsed.data.contactPhone,
          budget: parsed.data.budget === undefined ? null : parsed.data.budget.toFixed(2),
          expectedDate: normalizeExpectedDate(parsed.data.expectedDate),
          deliveryAddress: parsed.data.deliveryAddress || null,
          needsInvoice: parsed.data.needsInvoice,
          content: {
            scene: parsed.data.scene,
            fields: parsed.data.fields,
            source,
          },
          notes: parsed.data.notes || null,
        },
        select: { id: true, inquiryNo: true },
      });

      if (promoter?.isActive) {
        await tx.promoterCode.update({
          where: { id: promoter.id },
          data: { leadCount: { increment: 1 }, scanCount: { increment: 1 } },
        });
      }

      return { leadId: lead.id, inquiryId: inquiry.id, inquiryNo: inquiry.inquiryNo };
    });

    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/inquiries");
    revalidatePath("/dashboard/promoters");
    return {
      success: true,
      message: `已提交需求，询价单号 ${result.inquiryNo}`,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "CREATE_INQUIRY_FAILED",
        message: error instanceof Error ? error.message : "提交失败，请稍后重试",
      },
    };
  }
}

export async function createQuote(input: unknown): Promise<ActionResult<{ quoteNo: string; quoteId: string }>> {
  let createdById: string;
  try {
    createdById = await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = createQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "报价信息不完整" } };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inquiry = await tx.inquiry.findUnique({
        where: { id: parsed.data.inquiryId },
        select: { id: true, customerId: true, leadId: true, inquiryNo: true, contactName: true, contactPhone: true, scene: true },
      });

      if (!inquiry) {
        throw new Error("询价单不存在");
      }

      const quoteNo = await buildQuoteNo(tx);
      const quote = await tx.quote.create({
        data: {
          quoteNo,
          status: "SENT",
          inquiryId: inquiry.id,
          customerId: inquiry.customerId,
          createdById,
          totalAmount: toMoney(parsed.data.totalAmount),
          validUntil: normalizeOptionalDate(parsed.data.validUntil),
          content: {
            text: parsed.data.content,
            inquiryNo: inquiry.inquiryNo,
            contactName: inquiry.contactName,
            contactPhone: inquiry.contactPhone,
            scene: inquiry.scene,
          },
        },
        select: { id: true, quoteNo: true },
      });

      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: { status: "QUOTED" },
      });

      if (inquiry.leadId) {
        await tx.lead.update({
          where: { id: inquiry.leadId },
          data: { status: "FOLLOWING" },
        });
      }

      return { quoteId: quote.id, quoteNo: quote.quoteNo };
    });

    revalidatePath("/dashboard/inquiries");
    revalidatePath("/dashboard/quotes");
    revalidatePath("/dashboard/leads");
    return { success: true, message: `报价单 ${result.quoteNo} 已生成`, data: result };
  } catch (error) {
    return { success: false, error: { code: "CREATE_QUOTE_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createPromoterCode(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = createPromoterCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "推广码信息不完整" } };
  }

  try {
    const code = normalizePromoterCode(parsed.data.code, parsed.data.ownerType);
    const promoter = await prisma.promoterCode.create({
      data: {
        code,
        ownerType: parsed.data.ownerType,
        label: parsed.data.label,
        scene: parsed.data.scene ?? null,
        salespersonId: parsed.data.ownerType === "SALESPERSON" ? parsed.data.salespersonId : null,
        dealerId: parsed.data.ownerType === "DEALER" ? parsed.data.dealerId : null,
        campaignId: parsed.data.ownerType === "CAMPAIGN" ? parsed.data.campaignId : null,
      },
      select: { id: true, code: true },
    });

    revalidatePath("/dashboard/promoters");
    revalidatePath("/shop/channel");
    return { success: true, message: `推广码 ${promoter.code} 已生成`, data: promoter };
  } catch (error) {
    return { success: false, error: { code: "CREATE_PROMOTER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateDealerPolicy(input: unknown): Promise<ActionResult> {
  try {
    await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = dealerPolicySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "政策信息不完整" } };
  }

  try {
    await prisma.dealerPolicy.upsert({
      where: { dealerId: parsed.data.dealerId },
      update: {
        minOrderAmount: toMoney(parsed.data.minOrderAmount),
        maxOrderAmount: parsed.data.maxOrderAmount === undefined ? null : toMoney(parsed.data.maxOrderAmount),
        priceLevel: parsed.data.priceLevel,
        allowCrossZone: parsed.data.allowCrossZone,
        allowReject: parsed.data.allowReject,
        rejectLimitPerDay: parsed.data.rejectLimitPerDay,
        priority: parsed.data.priority,
        brandIds: parsed.data.brandIds,
        notes: parsed.data.notes || null,
      },
      create: {
        dealerId: parsed.data.dealerId,
        minOrderAmount: toMoney(parsed.data.minOrderAmount),
        maxOrderAmount: parsed.data.maxOrderAmount === undefined ? null : toMoney(parsed.data.maxOrderAmount),
        priceLevel: parsed.data.priceLevel,
        allowCrossZone: parsed.data.allowCrossZone,
        allowReject: parsed.data.allowReject,
        rejectLimitPerDay: parsed.data.rejectLimitPerDay,
        priority: parsed.data.priority,
        brandIds: parsed.data.brandIds,
        notes: parsed.data.notes || null,
      },
    });

    revalidatePath("/dashboard/dealers");
    revalidatePath(`/dashboard/dealers/${parsed.data.dealerId}/policy`);
    return { success: true, message: "经销商政策已保存" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_POLICY_FAILED", message: getErrorMessage(error) } };
  }
}
