"use server";

import type { LeadScene, LeadSource, OrderType, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { createPromoterCodeSchema, createQuoteSchema, convertQuoteToOrderSchema, dealerPolicySchema, scenarioInquirySchema } from "@/features/channel/schemas";
import { logAction } from "@/features/logs/audit";
import { routeOrderById } from "@/features/orders/routing";
import { buildOrderNoSequence, toMoney } from "@/features/orders/utils";
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

async function buildOrderNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  return buildOrderNoSequence(count, now);
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

type InquiryOrderItem = {
  productId: string;
  quantity: number;
  amountHint?: number;
};

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numberOrUndefined(value: unknown) {
  const next = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(next) ? next : undefined;
}

function extractInquiryOrderItems(content: Prisma.JsonValue | null | undefined): InquiryOrderItem[] {
  const object = jsonObject(content);
  const items = object?.items;
  if (!Array.isArray(items)) return [];

  const result: InquiryOrderItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const productId = typeof row.productId === "string" ? row.productId : "";
    const quantity = numberOrUndefined(row.quantity);
    if (!productId || !quantity || quantity < 1) continue;
    const amountHint = numberOrUndefined(row.totalAmount) ?? ((numberOrUndefined(row.unitPrice) ?? 0) * quantity || undefined);
    result.push({
      productId,
      quantity: Math.floor(quantity),
      ...(amountHint === undefined ? {} : { amountHint }),
    });
  }
  return result;
}

function orderTypeFromScene(scene: LeadScene): OrderType {
  if (scene === "RESTOCK") return "WHOLESALE";
  if (scene === "BANQUET" || scene === "GROUP_BUY") return "GROUP_BUY";
  return "RETAIL";
}

const districts = ["雨湖区", "岳塘区", "湘潭县", "湘乡市", "韶山市"];

function normalizeAddressDetail(value: string | null | undefined) {
  const raw = value?.trim() || "报价转订单待确认地址";
  const district = districts.find((item) => raw.includes(item)) ?? "雨湖区";
  const detail = raw
    .replace("湖南省", "")
    .replace("湘潭市", "")
    .replace(district, "")
    .trim();
  return { district, detail: detail || raw };
}

async function ensureQuoteCustomer(tx: Prisma.TransactionClient, inquiry: { customerId: string | null; contactName: string; contactPhone: string }) {
  if (inquiry.customerId) return inquiry.customerId;

  const existing = await tx.customer.findUnique({
    where: { phone: inquiry.contactPhone },
    select: { id: true },
  });
  if (existing) return existing.id;

  const password = await hash(`quote-${inquiry.contactPhone}-${Date.now()}`, 12);
  const customer = await tx.customer.create({
    data: {
      name: inquiry.contactName,
      phone: inquiry.contactPhone,
      password,
      type: "CONSUMER",
      isVerified: true,
    },
    select: { id: true },
  });
  return customer.id;
}

async function ensureQuoteAddress(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    contactName: string;
    contactPhone: string;
    deliveryAddress: string | null;
  },
) {
  if (!input.deliveryAddress) {
    const existing = await tx.address.findFirst({
      where: { customerId: input.customerId, city: "湘潭市" },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const count = await tx.address.count({ where: { customerId: input.customerId } });
  const normalized = normalizeAddressDetail(input.deliveryAddress);
  const address = await tx.address.create({
    data: {
      customerId: input.customerId,
      name: input.contactName,
      phone: input.contactPhone,
      province: "湖南省",
      city: "湘潭市",
      district: normalized.district,
      detail: normalized.detail,
      isDefault: count === 0,
    },
    select: { id: true },
  });
  return address.id;
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

export async function convertQuoteToOrder(input: unknown): Promise<ActionResult<{ orderId: string; orderNo: string }>> {
  let operatorId: string;
  try {
    operatorId = await requireStaff();
  } catch (error) {
    return { success: false, error: { code: "UNAUTHORIZED", message: getErrorMessage(error) } };
  }

  const parsed = convertQuoteToOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "报价单信息不完整" } };
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({
        where: { id: parsed.data.quoteId },
        include: {
          inquiry: {
            select: {
              id: true,
              inquiryNo: true,
              scene: true,
              status: true,
              leadId: true,
              customerId: true,
              contactName: true,
              contactPhone: true,
              deliveryAddress: true,
              content: true,
              notes: true,
            },
          },
        },
      });

      if (!quote) {
        throw new Error("报价单不存在");
      }
      if (quote.convertedOrderId || quote.status === "CONVERTED") {
        throw new Error("该报价单已转订单");
      }
      if (quote.status === "REJECTED" || quote.status === "EXPIRED") {
        throw new Error("已拒绝或已过期的报价单不能转订单");
      }
      if (quote.status !== "SENT" && quote.status !== "ACCEPTED") {
        throw new Error("只有已发送或已接受的报价单可以转订单");
      }
      if (quote.validUntil && quote.validUntil.getTime() < Date.now()) {
        throw new Error("报价单已过有效期，不能转订单");
      }

      const inquiryItems = extractInquiryOrderItems(quote.inquiry.content);
      if (inquiryItems.length === 0) {
        throw new Error("该询价没有商品明细，请先通过购物车分流生成询价，或使用后台手动开单补齐商品");
      }

      const productIds = inquiryItems.map((item) => item.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map((product) => [product.id, product]));
      for (const item of inquiryItems) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== "ACTIVE") {
          throw new Error("报价商品不存在或已下架");
        }
        if (product.stock < item.quantity) {
          throw new Error(`${product.name} 库存不足，无法转订单`);
        }
      }

      const customerId = await ensureQuoteCustomer(tx, quote.inquiry);
      const addressId = await ensureQuoteAddress(tx, {
        customerId,
        contactName: quote.inquiry.contactName,
        contactPhone: quote.inquiry.contactPhone,
        deliveryAddress: quote.inquiry.deliveryAddress,
      });
      const quoteAmount = Number(quote.totalAmount);
      const rawTotal = inquiryItems.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        return sum + (item.amountHint && item.amountHint > 0 ? item.amountHint : Number(product?.retailPrice ?? 0) * item.quantity);
      }, 0);
      const ratio = rawTotal > 0 ? quoteAmount / rawTotal : 1;
      const orderNo = await buildOrderNo(tx);
      const isCredit = quote.inquiry.scene === "RESTOCK";
      const orderType = orderTypeFromScene(quote.inquiry.scene);

      const created = await tx.order.create({
        data: {
          orderNo,
          customerId,
          type: orderType,
          source: "MANUAL",
          status: isCredit ? "CONFIRMED" : "PAID",
          totalAmount: toMoney(quoteAmount),
          discountAmount: "0.00",
          payableAmount: toMoney(quoteAmount),
          paidAmount: isCredit ? "0.00" : toMoney(quoteAmount),
          payMethod: isCredit ? "CREDIT" : "TRANSFER",
          addressId,
          routingType: "WAREHOUSE",
          salesPersonId: operatorId,
          remark: `报价单 ${quote.quoteNo} 转订单；询价单 ${quote.inquiry.inquiryNo}${quote.inquiry.notes ? `；${quote.inquiry.notes}` : ""}`,
          items: {
            create: inquiryItems.map((item) => {
              const product = productMap.get(item.productId);
              if (!product) throw new Error("报价商品不存在");
              const baseLineAmount = item.amountHint && item.amountHint > 0 ? item.amountHint : Number(product.retailPrice) * item.quantity;
              const lineAmount = baseLineAmount * ratio;
              return {
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                unitPrice: toMoney(lineAmount / item.quantity),
                quantity: item.quantity,
                totalAmount: toMoney(lineAmount),
              };
            }),
          },
          payments: {
            create: {
              customerId,
              type: "RECEIVE",
              amount: toMoney(quoteAmount),
              method: isCredit ? "CREDIT" : "TRANSFER",
              status: isCredit ? "PENDING" : "COMPLETED",
              dueDate: isCredit ? new Date(Date.now() + 30 * 86400000) : null,
              paidAt: isCredit ? null : new Date(),
              transactionId: isCredit ? null : `QUOTE-${quote.quoteNo}`,
              operatorId,
            },
          },
        },
        select: { id: true, orderNo: true },
      });

      for (const item of inquiryItems) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error("报价商品不存在");
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
            remark: `报价单 ${quote.quoteNo} 转订单出库`,
          },
        });
      }

      await tx.quote.update({
        where: { id: quote.id },
        data: { status: "CONVERTED", convertedOrderId: created.id, customerId },
      });
      await tx.inquiry.update({
        where: { id: quote.inquiry.id },
        data: { status: "WON", customerId },
      });
      if (quote.inquiry.leadId) {
        await tx.lead.update({
          where: { id: quote.inquiry.leadId },
          data: { status: "CONVERTED", customerId },
        });
      }

      return { orderId: created.id, orderNo: created.orderNo, quoteNo: quote.quoteNo };
    });

    await routeOrderById(order.orderId);
    await logAction({
      module: "渠道经营",
      action: "报价转订单",
      targetType: "Quote",
      targetId: parsed.data.quoteId,
      targetName: order.quoteNo,
      after: order,
      summary: `报价单 ${order.quoteNo} 转为订单 ${order.orderNo}`,
    });

    revalidatePath("/dashboard/quotes");
    revalidatePath("/dashboard/inquiries");
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${order.orderId}`);
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/finance");
    return { success: true, message: `已生成订单 ${order.orderNo}`, data: { orderId: order.orderId, orderNo: order.orderNo } };
  } catch (error) {
    return { success: false, error: { code: "CONVERT_QUOTE_FAILED", message: getErrorMessage(error) } };
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
