import type { OrderStatus, PayMethod, ProductStatus, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import { updateDealerPolicy } from "@/features/channel/actions";
import { approveDealerApplication, rejectDealerApplication } from "@/features/dealers/actions";
import { routeOrderById } from "@/features/orders/routing";
import { updateOrderStatus } from "@/features/orders/actions";
import { stockIn, stockOut } from "@/features/inventory/actions";
import { updateSafeStock, createStockCheck } from "@/features/warehouse/actions";
import { registerPayment } from "@/features/finance/actions";
import { issueInvoice } from "@/features/receipts/actions";
import { saveBusinessConfigs, createStaffUser, setStaffUserStatus, resetStaffUserPassword } from "@/features/settings/actions";
import { reportDealerStock, acceptRouting, rejectRouting } from "@/features/dealer/actions";
import { createCoupon, createProductPush, issueCouponByTag } from "@/features/marketing/actions";
import { sendOrderStatusTemplate } from "@/features/wechat/official";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import { roleHasPermission } from "@/features/auth/permissions";
import { logAction } from "@/features/logs/audit";
import { getLaunchReadinessReport } from "@/features/system/launch-readiness";
import { getOperationalAcceptanceReport } from "@/features/system/operational-acceptance";
import { getSystemCompletenessReport } from "@/features/system/system-completeness";
import {
  buildAgentCapabilityDetails,
  canUseAgentCapability,
  describeAgentCapability,
  findAgentCapabilityById,
  rankAgentCapabilitiesForMessage,
} from "@/features/ai/tools/capabilities";
import { prisma } from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "@/lib/revalidate";
import type { AiToolDefinition, AiToolResult, AiToolContext, AiToolDetail } from "@/features/ai/tools/types";

const revenueStatuses: OrderStatus[] = ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"];
const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  CONFIRMED: "已确认",
  SHIPPING: "配送中",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(value);
}

function toMoney(value: number) {
  return value.toFixed(2);
}

function startForPeriod(period?: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "day") return start;
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return start;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function errorFromAction<T>(
  result: { success: true; data?: T } | { success: false; error?: { message: string } },
  fallback: string,
): asserts result is { success: true; data?: T } {
  if (!result.success) {
    throw new Error(result.error?.message ?? fallback);
  }
}

function details(rows: Array<[string, string | number | null | undefined]>): AiToolDetail[] {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).length > 0)
    .map(([label, value]) => ({ label, value: String(value) }));
}

const customerLookupSchema = z.object({
  customerQuery: z.string().trim().min(1, "请说明客户姓名或手机号"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const dealerLookupSchema = z.object({
  dealerQuery: z.string().trim().min(1, "请说明经销商门店、联系人或手机号"),
  period: z.enum(["day", "week", "month", "all"]).default("month"),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const customerOrderDraftSchema = z.object({
  customerQuery: z.string().trim().min(1, "请说明客户姓名或手机号"),
  productQuery: z.string().trim().min(1, "请说明要买的商品"),
  quantity: z.coerce.number().int().min(1).max(9999),
  payMethod: z.enum(["WECHAT", "CASH", "TRANSFER", "CREDIT"]).default("WECHAT"),
  remark: z.string().max(200).optional(),
});

async function findProductByQuery(productQuery: string) {
  const query = productQuery.trim();
  if (!query) throw new Error("请说明商品名称");

  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { id: query },
        { sku: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { brand: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    include: { brand: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { salesCount: "desc" }],
  });

  if (!product) throw new Error(`未找到商品：${query}`);
  return product;
}

async function findOrderByNoOrId(value: string, context: AiToolContext) {
  if (!value.trim()) throw new Error("请提供订单号");
  const scope: Prisma.OrderWhereInput =
    context.role === "SALESPERSON" ? { OR: [{ salesPersonId: context.user.id }, { customer: { salesPersonId: context.user.id } }] } : {};
  const order = await prisma.order.findFirst({
    where: {
      AND: [
        {
          OR: [{ id: value.trim() }, { orderNo: { equals: value.trim(), mode: "insensitive" } }],
        },
        scope,
      ],
    },
    select: { id: true, orderNo: true, status: true, payableAmount: true },
  });
  if (!order) throw new Error("订单不存在或无权限操作");
  return order;
}

async function findDealerRoutingByInput(value: string, customerId: string) {
  const input = value.trim();
  if (!input) throw new Error("请提供待接订单号");
  const dealer = await prisma.dealer.findUnique({ where: { customerId } });
  if (!dealer) throw new Error("经销商档案不存在");
  const routing = await prisma.orderRouting.findFirst({
    where: {
      dealerId: dealer.id,
      OR: [{ id: input }, { order: { orderNo: { equals: input, mode: "insensitive" } } }],
    },
    include: { order: true },
  });
  if (!routing) throw new Error("待接订单不存在");
  return routing;
}

async function findCustomerByQuery(customerQuery: string, context: AiToolContext) {
  const query = customerQuery.trim();
  if (!query) throw new Error("请说明客户姓名或手机号");
  const scope: Prisma.CustomerWhereInput = context.role === "SALESPERSON" ? { salesPersonId: context.user.id } : {};
  const customer = await prisma.customer.findFirst({
    where: {
      AND: [
        scope,
        {
          OR: [
            { id: query },
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
          ],
        },
      ],
    },
    include: { salesPerson: { select: { id: true, name: true } }, tags: true },
  });
  if (!customer) throw new Error("客户不存在或无权限操作");
  return customer;
}

async function resolvePaymentTarget(input: { customerQuery?: string; orderNo: string }) {
  const orderNo = input.orderNo.trim();
  if (!orderNo) throw new Error("请提供订单号");
  const orderWhere: Prisma.OrderWhereInput = {
    OR: [{ id: orderNo }, { orderNo: { equals: orderNo, mode: "insensitive" } }],
  };

  if (input.customerQuery?.trim()) {
    const query = input.customerQuery.trim();
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [{ id: query }, { name: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }],
      },
    });
    if (!customer) throw new Error("客户不存在");
    const order = await prisma.order.findFirst({ where: { customerId: customer.id, ...orderWhere } });
    if (!order) throw new Error("订单不存在");
    return { customer, order };
  }

  const order = await prisma.order.findFirst({
    where: orderWhere,
    include: { customer: true },
  });
  if (!order) throw new Error("订单不存在");
  return { customer: order.customer, order };
}

async function findSalespersonByQuery(salesPersonQuery?: string | null) {
  const query = salesPersonQuery?.trim();
  if (!query) return null;
  const salesperson = await prisma.user.findFirst({
    where: {
      role: "SALESPERSON",
      OR: [
        { id: query },
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
      ],
    },
    select: { id: true, name: true, phone: true },
  });
  if (!salesperson) throw new Error("未找到销售员");
  return salesperson;
}

async function findDealerByQuery(dealerQuery: string, context: AiToolContext) {
  const query = dealerQuery.trim();
  if (!query) throw new Error("请说明经销商门店、联系人或手机号");
  const dealer = await prisma.dealer.findFirst({
    where: {
      AND: [
        context.role === "SALESPERSON" ? { customer: { salesPersonId: context.user.id } } : {},
        {
          OR: [
            { id: query },
            { shopName: { contains: query, mode: "insensitive" } },
            { customer: { name: { contains: query, mode: "insensitive" } } },
            { customer: { phone: { contains: query } } },
          ],
        },
      ],
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, salesPersonId: true } },
      policy: true,
    },
  });
  if (!dealer) throw new Error("经销商不存在或无权限操作");
  return dealer;
}

async function findDealerApplicationLead(leadQuery: string) {
  const query = leadQuery.trim();
  if (!query) throw new Error("请说明经销商申请线索");
  const lead = await prisma.lead.findFirst({
    where: {
      scene: "DEALER_JOIN",
      OR: [
        { id: query },
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { customer: { name: { contains: query, mode: "insensitive" } } },
        { customer: { phone: { contains: query } } },
      ],
    },
    include: { customer: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!lead) throw new Error("未找到经销商申请");
  return lead;
}

async function findCouponByQuery(couponQuery: string) {
  const query = couponQuery.trim();
  if (!query) throw new Error("请说明优惠券名称");
  const coupon = await prisma.coupon.findFirst({
    where: {
      OR: [
        { id: query },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!coupon) throw new Error("未找到优惠券");
  return coupon;
}

async function resolveBrandIds(brandQueries?: string[]) {
  const queries = brandQueries?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (!queries.length) return [];
  const brands = await prisma.brand.findMany({
    where: {
      OR: queries.flatMap((query) => [{ id: query }, { name: { contains: query, mode: "insensitive" } }]),
    },
    select: { id: true, name: true },
  });
  if (brands.length === 0) throw new Error("未找到匹配品牌");
  return brands;
}

function couponDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function generateOrderNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `HQ${day}${String(count + 1).padStart(6, "0")}`;
}

async function generateInquiryNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.inquiry.count({ where: { createdAt: { gte: start } } });
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `XJ${day}${String(count + 1).padStart(5, "0")}`;
}

function revalidateOrderLikeViews(orderId?: string) {
  revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
  revalidatePath("/shop");
  revalidatePath("/shop/catalog");
  revalidatePath("/shop/my-orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/records");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/inquiries");
  if (orderId) revalidatePath(`/dashboard/orders/${orderId}`);
}

async function buildCustomerOrderDraft(input: { productQuery: string; quantity: number; addressId?: string | null }, context: AiToolContext) {
  const [product, customer] = await Promise.all([
    findProductByQuery(input.productQuery!),
    prisma.customer.findUnique({
      where: { id: context.user.id },
      include: { addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 1 } },
    }),
  ]);
  if (!customer) throw new Error("客户不存在");
  const address = input.addressId
    ? await prisma.address.findFirst({ where: { id: input.addressId, customerId: customer.id } })
    : customer.addresses[0];
  if (!address) throw new Error("请先维护收货地址");

  const totalAmount = Number(product.retailPrice) * input.quantity;
  const bulkConfig = await prisma.systemConfig.findUnique({ where: { key: "bulkOrderAmount" }, select: { value: true } });
  const bulkOrderAmount = typeof bulkConfig?.value === "number" ? bulkConfig.value : 500;
  const shouldCreateInquiry = totalAmount >= bulkOrderAmount || input.quantity >= product.bulkThreshold;
  return { product, customer, address, totalAmount, shouldCreateInquiry, bulkOrderAmount };
}

async function createCustomerOrderFromAi(input: { productQuery: string; quantity: number; payMethod?: PayMethod; addressId?: string | null; remark?: string }, context: AiToolContext): Promise<AiToolResult> {
  const draft = await buildCustomerOrderDraft(input, context);
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: draft.product.id } });
    if (!product || product.status !== "ACTIVE") throw new Error("商品不存在或已下架");
    const customer = await tx.customer.findUnique({ where: { id: context.user.id }, select: { id: true, name: true, phone: true, salesPersonId: true, dealer: { select: { id: true } } } });
    if (!customer) throw new Error("客户不存在");
    const address = await tx.address.findFirst({ where: { id: draft.address.id, customerId: customer.id } });
    if (!address) throw new Error("收货地址不存在");
    if (address.city !== "湘潭市") throw new Error("当前仅支持湘潭市配送");

    if (draft.shouldCreateInquiry) {
      const inquiryNo = await generateInquiryNo(tx);
      const salespersonId = customer.salesPersonId ?? null;
      const dealerId = customer.dealer?.id ?? null;
      const item = {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unitPrice: Number(product.retailPrice),
        quantity: input.quantity,
        totalAmount: Number(product.retailPrice) * input.quantity,
        bulkThreshold: product.bulkThreshold,
      };
      const lead = await tx.lead.create({
        data: {
          source: "AI_INTERACTION",
          scene: "RETAIL",
          status: salespersonId || dealerId ? "ASSIGNED" : "NEW",
          name: customer.name,
          phone: customer.phone,
          customerId: customer.id,
          salespersonId,
          dealerId,
          notes: input.remark || "AI 助手提交",
          metadata: jsonObject({ tool: "customer_submit_order", totalAmount: draft.totalAmount, item }),
          consentAccepted: true,
        },
        select: { id: true },
      });
      const inquiry = await tx.inquiry.create({
        data: {
          inquiryNo,
          scene: "RETAIL",
          status: salespersonId || dealerId ? "ASSIGNED" : "NEW",
          leadId: lead.id,
          customerId: customer.id,
          salespersonId,
          dealerId,
          contactName: address.name || customer.name,
          contactPhone: address.phone || customer.phone,
          budget: toMoney(draft.totalAmount),
          deliveryAddress: `湘潭市${address.district}${address.detail}`,
          content: jsonObject({ source: "AI_TOOL", items: [item], payMethod: input.payMethod ?? "WECHAT" }),
          notes: input.remark || null,
        },
        select: { id: true, inquiryNo: true },
      });
      return { kind: "INQUIRY" as const, id: inquiry.id, no: inquiry.inquiryNo };
    }

    if (product.stock < input.quantity) throw new Error(`${product.name} 库存不足`);
    const operator = await tx.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
    if (!operator) throw new Error("未找到库存操作员，请先创建管理员账号");
    const orderNo = await generateOrderNo(tx);
    const totalAmount = Number(product.retailPrice) * input.quantity;
    const created = await tx.order.create({
      data: {
        orderNo,
        customerId: customer.id,
        type: "RETAIL",
        status: "PAID",
        totalAmount: toMoney(totalAmount),
        discountAmount: "0.00",
        payableAmount: toMoney(totalAmount),
        paidAmount: toMoney(totalAmount),
        payMethod: input.payMethod ?? "WECHAT",
        source: "H5",
        addressId: address.id,
        remark: input.remark || "AI 助手下单",
        routingType: "WAREHOUSE",
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unitPrice: product.retailPrice,
            quantity: input.quantity,
            totalAmount: toMoney(totalAmount),
          },
        },
        payments: {
          create: {
            customerId: customer.id,
            type: "RECEIVE",
            amount: toMoney(totalAmount),
            method: input.payMethod ?? "WECHAT",
            status: "COMPLETED",
            transactionId: `AI-${orderNo}`,
            paidAt: new Date(),
          },
        },
      },
      select: { id: true, orderNo: true },
    });
    const afterStock = product.stock - input.quantity;
    await tx.product.update({
      where: { id: product.id },
      data: { stock: afterStock, salesCount: { increment: input.quantity }, status: afterStock === 0 ? "OUT_OF_STOCK" : "ACTIVE" },
    });
    await tx.stockRecord.create({
      data: {
        productId: product.id,
        type: "OUT",
        quantity: -input.quantity,
        beforeStock: product.stock,
        afterStock,
        relatedOrderId: created.id,
        operatorId: operator.id,
        remark: `AI 助手订单 ${orderNo} 出库`,
      },
    });
    return { kind: "ORDER" as const, id: created.id, no: created.orderNo };
  });

  if (result.kind === "ORDER") {
    await routeOrderById(result.id);
    await sendOrderStatusTemplate(result.id, "paid");
    revalidateOrderLikeViews(result.id);
    return {
      title: "订单已生成",
      summary: `已为您生成订单 ${result.no}，系统会继续处理配送。`,
      href: `/shop/my-orders/${result.id}`,
      details: details([
        ["订单号", result.no],
        ["商品", draft.product.name],
        ["数量", input.quantity],
        ["金额", money(draft.totalAmount)],
      ]),
      data: result,
    };
  }

  revalidateOrderLikeViews();
  return {
    title: "已提交询价",
    summary: `该需求达到大单/询价条件，已生成询价单 ${result.no}，业务员会联系报价。`,
    href: "/shop/my-orders",
    details: details([
      ["询价单号", result.no],
      ["商品", draft.product.name],
      ["数量", input.quantity],
      ["预计金额", money(draft.totalAmount)],
    ]),
    data: result,
  };
}

const productSearchSchema = z.object({ query: z.string().trim().min(1), limit: z.coerce.number().int().min(1).max(20).default(6) });
const periodSchema = z.object({ period: z.enum(["day", "week", "month"]).default("month") });
const featureNavigationSchema = z.object({
  capabilityId: z.string().trim().optional(),
  query: z.string().trim().min(1).optional(),
}).refine((input) => Boolean(input.capabilityId || input.query), { message: "请提供功能名称或能力 ID" });
const summaryQuerySchema = z.object({
  query: z.string().trim().optional().default(""),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  period: z.enum(["all", "day", "week", "month"]).default("month"),
});
const orderSummarySchema = summaryQuerySchema.extend({
  status: z.enum(["", "PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED"]).optional().default(""),
});

function periodCreatedAtWhere(period?: string) {
  return period === "all" ? {} : { createdAt: { gte: startForPeriod(period) } };
}

function compactDate(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "-";
}

export const aiTools: AiToolDefinition[] = [
  {
    name: "navigate_to_feature",
    title: "打开功能入口",
    description: "按当前角色匹配全站功能入口，返回可进入页面和推荐下一步。",
    category: "NAVIGATE",
    riskLevel: "READ",
    inputSchema: featureNavigationSchema,
    handler: async (input, context) => {
      const explicit = input.capabilityId ? findAgentCapabilityById(input.capabilityId) : null;
      const ranked = input.query ? rankAgentCapabilitiesForMessage(input.query, context) : [];
      const capability = explicit && canUseAgentCapability(context, explicit) ? explicit : ranked[0]?.capability;

      if (!capability) {
        return {
          title: "未找到可进入功能",
          summary: "当前角色下没有匹配到可进入的页面，请换一个更具体的功能名称。",
          details: input.query ? [{ label: "查询", value: input.query }] : [],
        };
      }

      return {
        title: capability.title,
        summary: `${describeAgentCapability(capability)} 可以从这里进入。`,
        href: capability.href,
        details: buildAgentCapabilityDetails(capability),
        data: { capabilityId: capability.id, href: capability.href, kind: capability.kind },
      };
    },
  },
  {
    name: "feature_help",
    title: "功能帮助",
    description: "解释某个页面或业务功能能做什么，并说明当前角色是否可进入。",
    category: "NAVIGATE",
    riskLevel: "READ",
    inputSchema: featureNavigationSchema,
    handler: async (input, context) => {
      const explicit = input.capabilityId ? findAgentCapabilityById(input.capabilityId) : null;
      const ranked = input.query ? rankAgentCapabilitiesForMessage(input.query, context, { includeInaccessible: true }) : [];
      const capability = explicit ?? ranked[0]?.capability;

      if (!capability) {
        return {
          title: "未找到功能说明",
          summary: "我还没有匹配到对应页面，请补充模块名或功能名。",
          details: input.query ? [{ label: "查询", value: input.query }] : [],
        };
      }

      const allowed = canUseAgentCapability(context, capability);
      return {
        title: capability.title,
        summary: allowed ? describeAgentCapability(capability) : `当前角色 ${context.role} 暂不能进入：${describeAgentCapability(capability)}`,
        href: allowed ? capability.href : undefined,
        details: [
          ...buildAgentCapabilityDetails(capability),
          { label: "当前角色", value: context.role },
          { label: "可进入", value: allowed ? "是" : "否" },
          { label: "示例问法", value: capability.examples.join(" / ") },
        ],
        data: { capabilityId: capability.id, href: capability.href, allowed },
      };
    },
  },
  {
    name: "purchase_supplier_summary",
    title: "采购与供应商摘要",
    description: "查询采购单、供应商状态、采购金额和近期采购记录。",
    riskLevel: "READ",
    access: { permission: "purchase:manage" },
    inputSchema: summaryQuerySchema,
    handler: async (input) => {
      const query = String(input.query ?? "").trim();
      const purchaseWhere: Prisma.PurchaseOrderWhereInput = {
        ...periodCreatedAtWhere(input.period),
        ...(query
          ? {
              supplier: {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { contactName: { contains: query, mode: "insensitive" } },
                  { phone: { contains: query, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      };
      const supplierWhere: Prisma.SupplierWhereInput = query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { contactName: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
            ],
          }
        : {};
      const [supplierCount, activeSupplierCount, purchaseCount, purchaseAmount, statusRows, recent] = await Promise.all([
        prisma.supplier.count({ where: supplierWhere }),
        prisma.supplier.count({ where: { ...supplierWhere, isActive: true } }),
        prisma.purchaseOrder.count({ where: purchaseWhere }),
        prisma.purchaseOrder.aggregate({ where: purchaseWhere, _sum: { totalAmount: true } }),
        prisma.purchaseOrder.groupBy({ by: ["status"], where: purchaseWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
        prisma.purchaseOrder.findMany({
          where: purchaseWhere,
          include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "采购与供应商摘要",
        summary: `供应商 ${supplierCount} 家，启用 ${activeSupplierCount} 家；采购单 ${purchaseCount} 张，金额 ${money(Number(purchaseAmount._sum.totalAmount ?? 0))}。`,
        href: "/dashboard/purchase",
        details: [
          ...details([
            ["周期", input.period],
            ["供应商", supplierCount],
            ["启用供应商", activeSupplierCount],
            ["采购单", purchaseCount],
            ["采购金额", money(Number(purchaseAmount._sum.totalAmount ?? 0))],
          ]),
          ...statusRows.map((row) => ({ label: `状态 ${row.status}`, value: `${row._count._all} 张｜${money(Number(row._sum.totalAmount ?? 0))}` })),
          ...recent.map((order) => ({
            label: order.purchaseNo,
            value: `${order.supplier.name}｜${order.status}｜${order._count.items} 项｜${money(Number(order.totalAmount))}`,
          })),
        ],
      };
    },
  },
  {
    name: "product_catalog_summary",
    title: "产品分类品牌素材摘要",
    description: "查询商品、分类、品牌、图片素材审核和授权状态。",
    riskLevel: "READ",
    access: { permission: "products:view" },
    inputSchema: summaryQuerySchema,
    handler: async (input) => {
      const query = String(input.query ?? "").trim();
      const productWhere: Prisma.ProductWhereInput = query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
              { brand: { name: { contains: query, mode: "insensitive" } } },
              { category: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {};
      const materialWhere: Prisma.ProductImageMaterialWhereInput = {
        ...periodCreatedAtWhere(input.period),
        ...(query
          ? {
              OR: [
                { sourceName: { contains: query, mode: "insensitive" } },
                { product: { name: { contains: query, mode: "insensitive" } } },
                { product: { sku: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      };
      const [products, activeProducts, categories, brands, pendingReview, pendingLicense, duplicateMaterials, recentMaterials] = await Promise.all([
        prisma.product.count({ where: productWhere }),
        prisma.product.count({ where: { ...productWhere, status: "ACTIVE" } }),
        prisma.category.count(),
        prisma.brand.count(),
        prisma.productImageMaterial.count({ where: { ...materialWhere, reviewStatus: "PENDING" } }),
        prisma.productImageMaterial.count({ where: { ...materialWhere, licenseStatus: "PENDING" } }),
        prisma.productImageMaterial.count({ where: { ...materialWhere, duplicateOfMaterialId: { not: null } } }),
        prisma.productImageMaterial.findMany({
          where: materialWhere,
          include: { product: { select: { name: true, sku: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "产品分类品牌素材摘要",
        summary: `商品 ${products} 个，启用 ${activeProducts} 个；分类 ${categories} 个，品牌 ${brands} 个；待审核素材 ${pendingReview} 条。`,
        href: "/dashboard/products/materials",
        details: [
          ...details([
            ["商品", products],
            ["启用商品", activeProducts],
            ["分类", categories],
            ["品牌", brands],
            ["待审核素材", pendingReview],
            ["待授权素材", pendingLicense],
            ["重复素材", duplicateMaterials],
          ]),
          ...recentMaterials.map((material) => ({
            label: material.product.name,
            value: `${material.product.sku}｜审核 ${material.reviewStatus}｜授权 ${material.licenseStatus}｜${material.storageProvider}`,
          })),
        ],
      };
    },
  },
  {
    name: "inventory_records_summary",
    title: "库存流水摘要",
    description: "查询库存出入库流水、操作人、商品和库存变动。",
    riskLevel: "READ",
    access: { permission: "inventory:manage" },
    inputSchema: summaryQuerySchema,
    handler: async (input) => {
      const query = String(input.query ?? "").trim();
      const where: Prisma.StockRecordWhereInput = {
        ...periodCreatedAtWhere(input.period),
        ...(query
          ? {
              OR: [
                { product: { name: { contains: query, mode: "insensitive" } } },
                { product: { sku: { contains: query, mode: "insensitive" } } },
                { operator: { name: { contains: query, mode: "insensitive" } } },
                { remark: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [count, quantityByType, recent] = await Promise.all([
        prisma.stockRecord.count({ where }),
        prisma.stockRecord.groupBy({ by: ["type"], where, _count: { _all: true }, _sum: { quantity: true } }),
        prisma.stockRecord.findMany({
          where,
          include: { product: { select: { name: true, sku: true } }, operator: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "库存流水摘要",
        summary: `当前范围共有 ${count} 条库存流水。`,
        href: "/dashboard/inventory/records",
        details: [
          ...quantityByType.map((row) => ({ label: row.type, value: `${row._count._all} 条｜${row._sum.quantity ?? 0} 件` })),
          ...recent.map((record) => ({
            label: record.product.name,
            value: `${record.type} ${record.quantity}｜${record.beforeStock} -> ${record.afterStock}｜${record.operator.name ?? "系统"}｜${compactDate(record.createdAt)}`,
          })),
        ],
      };
    },
  },
  {
    name: "shop_account_summary",
    title: "商城账户摘要",
    description: "消费者查询自己的账户、地址、订单、购物车、优惠券和欠款概况。",
    riskLevel: "READ",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({}),
    handler: async (_input, context) => {
      const [customer, cartCount, couponCount, orderCount] = await Promise.all([
        prisma.customer.findUnique({
          where: { id: context.user.id },
          include: { addresses: { select: { name: true, phone: true, city: true, district: true, isDefault: true }, take: 5 } },
        }),
        prisma.cartItem.count({ where: { customerId: context.user.id } }),
        prisma.customerCoupon.count({ where: { customerId: context.user.id, status: "UNUSED" } }),
        prisma.order.count({ where: { customerId: context.user.id } }),
      ]);
      if (!customer) throw new Error("未找到当前客户账户");

      return {
        title: "商城账户摘要",
        summary: `${customer.name}，地址 ${customer.addresses.length} 个，购物车 ${cartCount} 项，可用券 ${couponCount} 张，订单 ${orderCount} 笔。`,
        href: "/shop/account",
        details: [
          ...details([
            ["姓名", customer.name],
            ["手机号", customer.phone],
            ["积分", customer.points],
            ["信用额度", money(Number(customer.creditLimit))],
            ["欠款余额", money(Number(customer.balance))],
            ["购物车", cartCount],
            ["可用券", couponCount],
            ["订单数", orderCount],
          ]),
          ...customer.addresses.map((address) => ({
            label: address.isDefault ? "默认地址" : "地址",
            value: `${address.name} ${address.phone}｜${address.city}${address.district}`,
          })),
        ],
      };
    },
  },
  {
    name: "shop_cart_summary",
    title: "购物车摘要",
    description: "消费者查询自己的购物车商品、数量、选中状态和估算金额。",
    riskLevel: "READ",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) }),
    handler: async (input, context) => {
      const items = await prisma.cartItem.findMany({
        where: { customerId: context.user.id },
        include: { product: { select: { name: true, sku: true, retailPrice: true, stock: true, status: true } } },
        orderBy: { updatedAt: "desc" },
        take: input.limit,
      });
      const selectedAmount = items.filter((item) => item.selected).reduce((total, item) => total + Number(item.product.retailPrice) * item.quantity, 0);

      return {
        title: "购物车摘要",
        summary: items.length ? `购物车 ${items.length} 项，已选估算 ${money(selectedAmount)}。` : "购物车还是空的。",
        href: "/shop/cart",
        details: items.map((item) => ({
          label: item.product.name,
          value: `${item.quantity} 件｜${item.selected ? "已选" : "未选"}｜${money(Number(item.product.retailPrice) * item.quantity)}｜库存 ${item.product.stock}`,
        })),
      };
    },
  },
  {
    name: "shop_coupon_summary",
    title: "我的优惠券摘要",
    description: "消费者查询自己的优惠券、可用券、已用券和过期券。",
    riskLevel: "READ",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) }),
    handler: async (input, context) => {
      const [statusRows, coupons] = await Promise.all([
        prisma.customerCoupon.groupBy({ by: ["status"], where: { customerId: context.user.id }, _count: { _all: true } }),
        prisma.customerCoupon.findMany({
          where: { customerId: context.user.id },
          include: { coupon: { select: { name: true, type: true, amount: true, percent: true, threshold: true, endsAt: true, isActive: true } } },
          orderBy: { receivedAt: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "我的优惠券摘要",
        summary: statusRows.length ? statusRows.map((row) => `${row.status} ${row._count._all} 张`).join("，") : "暂时没有优惠券。",
        href: "/shop/coupons",
        details: coupons.map((item) => ({
          label: item.coupon.name,
          value: `${item.status}｜${item.coupon.type === "AMOUNT" ? money(Number(item.coupon.amount ?? 0)) : `${item.coupon.percent}%`}｜门槛 ${money(Number(item.coupon.threshold))}｜到期 ${compactDate(item.coupon.endsAt)}`,
        })),
      };
    },
  },
  {
    name: "wechat_ecosystem_summary",
    title: "微信生态摘要",
    description: "查询公众号模板消息、小程序分享和微信配置就绪概况。",
    riskLevel: "READ",
    access: { permission: "wechat:manage" },
    inputSchema: summaryQuerySchema,
    handler: async (input) => {
      const where = periodCreatedAtWhere(input.period);
      const [messageCount, messageStatuses, shareCount, recentMessages] = await Promise.all([
        prisma.wechatMessageLog.count({ where }),
        prisma.wechatMessageLog.groupBy({ by: ["status"], where, _count: { _all: true } }),
        prisma.wechatShareEvent.count({ where }),
        prisma.wechatMessageLog.findMany({
          where,
          include: { customer: { select: { name: true, phone: true } }, order: { select: { orderNo: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);
      const configKeys = ["WECHAT_MINI_APP_ID", "WECHAT_OFFICIAL_APP_ID", "WECHAT_OFFICIAL_ORDER_TEMPLATE_ID", "WECHAT_PAY_MCH_ID"];

      return {
        title: "微信生态摘要",
        summary: `微信消息 ${messageCount} 条，分享 ${shareCount} 条；关键配置 ${configKeys.filter((key) => Boolean(process.env[key])).length}/${configKeys.length} 项已配置。`,
        href: "/dashboard/wechat",
        details: [
          ...configKeys.map((key) => ({ label: key, value: process.env[key] ? "已配置" : "未配置" })),
          ...messageStatuses.map((row) => ({ label: `消息 ${row.status}`, value: `${row._count._all} 条` })),
          ...recentMessages.map((message) => ({
            label: message.scene,
            value: `${message.status}｜${message.customer?.name ?? message.openId ?? "未知用户"}｜${message.order?.orderNo ?? "-"}｜${compactDate(message.createdAt)}`,
          })),
        ],
      };
    },
  },
  {
    name: "admin_customer_account_summary",
    title: "客户账户代查",
    description: "管理员或销售代查指定客户账户、地址、订单、购物车、优惠券和欠款概况。",
    riskLevel: "READ",
    access: { permission: "customers:view" },
    inputSchema: customerLookupSchema,
    handler: async (input, context) => {
      const target = await findCustomerByQuery(input.customerQuery!, context);
      const [customer, cartCount, couponCount, orderCount] = await Promise.all([
        prisma.customer.findUnique({
          where: { id: target.id },
          include: {
            addresses: { select: { name: true, phone: true, city: true, district: true, detail: true, isDefault: true }, take: input.limit },
            salesPerson: { select: { name: true } },
          },
        }),
        prisma.cartItem.count({ where: { customerId: target.id } }),
        prisma.customerCoupon.count({ where: { customerId: target.id, status: "UNUSED" } }),
        prisma.order.count({ where: { customerId: target.id, parentId: null } }),
      ]);
      if (!customer) throw new Error("未找到客户账户");

      return {
        title: "客户账户代查",
        summary: `${customer.name}，地址 ${customer.addresses.length} 个，购物车 ${cartCount} 项，可用券 ${couponCount} 张，订单 ${orderCount} 笔。`,
        href: `/dashboard/customers?query=${encodeURIComponent(customer.phone ?? customer.name)}`,
        details: [
          ...details([
            ["客户", customer.name],
            ["手机号", customer.phone],
            ["类型", customer.type],
            ["归属销售", customer.salesPerson?.name ?? "未分配"],
            ["积分", customer.points],
            ["信用额度", money(Number(customer.creditLimit))],
            ["欠款余额", money(Number(customer.balance))],
            ["购物车", cartCount],
            ["可用券", couponCount],
            ["订单数", orderCount],
          ]),
          ...customer.addresses.map((address) => ({
            label: address.isDefault ? "默认地址" : "地址",
            value: `${address.name} ${address.phone}｜${address.city}${address.district}${address.detail}`,
          })),
        ],
      };
    },
  },
  {
    name: "admin_customer_cart_summary",
    title: "客户购物车代查",
    description: "管理员或销售代查指定客户购物车商品、数量、选中状态和估算金额。",
    riskLevel: "READ",
    access: { permission: "customers:view" },
    inputSchema: customerLookupSchema,
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const items = await prisma.cartItem.findMany({
        where: { customerId: customer.id },
        include: { product: { select: { name: true, sku: true, retailPrice: true, stock: true, status: true } } },
        orderBy: { updatedAt: "desc" },
        take: input.limit,
      });
      const selectedAmount = items.filter((item) => item.selected).reduce((total, item) => total + Number(item.product.retailPrice) * item.quantity, 0);

      return {
        title: "客户购物车代查",
        summary: items.length ? `${customer.name} 购物车 ${items.length} 项，已选估算 ${money(selectedAmount)}。` : `${customer.name} 的购物车为空。`,
        href: `/dashboard/customers?query=${encodeURIComponent(customer.phone ?? customer.name)}`,
        details: items.map((item) => ({
          label: item.product.name,
          value: `${item.quantity} 件｜${item.selected ? "已选" : "未选"}｜${money(Number(item.product.retailPrice) * item.quantity)}｜库存 ${item.product.stock}｜${item.product.status}`,
        })),
      };
    },
  },
  {
    name: "admin_customer_coupon_summary",
    title: "客户优惠券代查",
    description: "管理员或销售代查指定客户优惠券、可用券、已用券和过期券。",
    riskLevel: "READ",
    access: { permission: "customers:view" },
    inputSchema: customerLookupSchema,
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const [statusRows, coupons] = await Promise.all([
        prisma.customerCoupon.groupBy({ by: ["status"], where: { customerId: customer.id }, _count: { _all: true } }),
        prisma.customerCoupon.findMany({
          where: { customerId: customer.id },
          include: { coupon: { select: { name: true, type: true, amount: true, percent: true, threshold: true, endsAt: true, isActive: true } } },
          orderBy: { receivedAt: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "客户优惠券代查",
        summary: statusRows.length ? `${customer.name}：${statusRows.map((row) => `${row.status} ${row._count._all} 张`).join("，")}` : `${customer.name} 暂时没有优惠券。`,
        href: `/dashboard/customers?query=${encodeURIComponent(customer.phone ?? customer.name)}`,
        details: coupons.map((item) => ({
          label: item.coupon.name,
          value: `${item.status}｜${item.coupon.type === "AMOUNT" ? money(Number(item.coupon.amount ?? 0)) : `${item.coupon.percent}%`}｜门槛 ${money(Number(item.coupon.threshold))}｜到期 ${compactDate(item.coupon.endsAt)}`,
        })),
      };
    },
  },
  {
    name: "admin_customer_orders",
    title: "客户订单代查",
    description: "管理员或销售查询指定客户订单、配送和售后状态。",
    riskLevel: "READ",
    access: { permission: "orders:view" },
    inputSchema: customerLookupSchema,
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id, parentId: null },
        include: { delivery: true, items: true },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return {
        title: "客户订单代查",
        summary: orders.length ? `${customer.name} 最近 ${orders.length} 个订单如下。` : `${customer.name} 还没有订单记录。`,
        href: `/dashboard/orders?query=${encodeURIComponent(customer.phone ?? customer.name)}`,
        details: orders.map((order) => ({
          label: order.orderNo,
          value: `${orderStatusLabels[order.status]}｜${money(Number(order.payableAmount))}｜${order.items.reduce((sum, item) => sum + item.quantity, 0)} 件｜配送 ${order.delivery?.status ?? "未发货"}｜${compactDate(order.createdAt)}`,
        })),
      };
    },
  },
  {
    name: "admin_customer_receivables",
    title: "客户待付款代查",
    description: "管理员或财务查询指定客户赊账、欠款和待付款订单。",
    riskLevel: "READ",
    access: { permission: "finance:manage" },
    inputSchema: customerLookupSchema.omit({ limit: true }).extend({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id, parentId: null, status: { in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "REFUNDING"] } },
        orderBy: { createdAt: "asc" },
        take: input.limit,
      });
      const rows = orders
        .map((order) => ({ orderNo: order.orderNo, status: order.status, createdAt: order.createdAt, remaining: Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)) }))
        .filter((row) => row.remaining > 0);
      return {
        title: "客户待付款代查",
        summary: rows.length ? `${customer.name} 当前待付款合计 ${money(rows.reduce((sum, item) => sum + item.remaining, 0))}。` : `${customer.name} 当前没有待付款订单。`,
        href: `/dashboard/finance/statements?query=${encodeURIComponent(customer.phone ?? customer.name)}`,
        details: [
          ...details([
            ["客户余额", money(Number(customer.balance))],
            ["信用额度", money(Number(customer.creditLimit))],
          ]),
          ...rows.slice(0, 8).map((row) => ({ label: row.orderNo, value: `${orderStatusLabels[row.status]}｜${money(row.remaining)}｜${compactDate(row.createdAt)}` })),
        ],
      };
    },
  },
  {
    name: "admin_customer_order_draft",
    title: "客户开单草稿",
    description: "管理员或销售为指定客户生成开单草稿，不直接创建订单。",
    riskLevel: "DRAFT",
    access: { permission: "orders:write" },
    inputSchema: customerOrderDraftSchema,
    handler: async (input, context) => {
      const [customer, product] = await Promise.all([findCustomerByQuery(input.customerQuery!, context), findProductByQuery(input.productQuery!)]);
      const amount = Number(product.retailPrice) * input.quantity;
      return {
        title: "客户开单草稿",
        summary: `已整理 ${customer.name} 的开单意图：${input.quantity} 件 ${product.name}，预计 ${money(amount)}。`,
        href: "/dashboard/orders/new",
        details: details([
          ["客户", `${customer.name} ${customer.phone}`],
          ["归属销售", customer.salesPerson?.name ?? "未分配"],
          ["商品", `${product.name}｜${product.sku}`],
          ["单价", money(Number(product.retailPrice))],
          ["数量", input.quantity],
          ["预计金额", money(amount)],
          ["支付方式", input.payMethod],
          ["备注", input.remark],
          ["下一步", "进入后台开单页确认地址、商品明细和支付方式后再创建"],
        ]),
      };
    },
  },
  {
    name: "audit_log_summary",
    title: "操作日志摘要",
    description: "按模块、动作、操作人或关键词查询审计日志和 AI 工具调用记录。",
    riskLevel: "READ",
    access: { permission: "logs:manage" },
    inputSchema: summaryQuerySchema,
    handler: async (input) => {
      const query = String(input.query ?? "").trim();
      const where: Prisma.AuditLogWhereInput = {
        ...periodCreatedAtWhere(input.period),
        ...(query
          ? {
              OR: [
                { module: { contains: query, mode: "insensitive" } },
                { action: { contains: query, mode: "insensitive" } },
                { operatorName: { contains: query, mode: "insensitive" } },
                { targetName: { contains: query, mode: "insensitive" } },
                { summary: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [count, moduleRows, recent] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.groupBy({ by: ["module"], where, _count: { _all: true }, orderBy: { _count: { module: "desc" } }, take: 8 }),
        prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: input.limit }),
      ]);

      return {
        title: "操作日志摘要",
        summary: `当前范围共有 ${count} 条操作日志。`,
        href: "/dashboard/logs",
        details: [
          ...moduleRows.map((row) => ({ label: row.module, value: `${row._count._all} 条` })),
          ...recent.map((log) => ({
            label: `${log.module}｜${log.action}`,
            value: `${log.operatorName ?? "系统"}｜${log.summary.slice(0, 80)}｜${compactDate(log.createdAt)}`,
          })),
        ],
      };
    },
  },
  {
    name: "finance_statement_summary",
    title: "财务对账与票据摘要",
    description: "查询客户欠款、收款、对账口径、票据和财务报表细项。",
    riskLevel: "READ",
    access: { permission: "finance:manage" },
    inputSchema: summaryQuerySchema,
    handler: async (input) => {
      const where = periodCreatedAtWhere(input.period);
      const [paymentSum, paymentCount, invoiceSum, invoiceCount, debtors] = await Promise.all([
        prisma.payment.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { amount: true } }),
        prisma.payment.count({ where }),
        prisma.invoice.aggregate({ where, _sum: { amount: true, taxAmount: true } }),
        prisma.invoice.count({ where }),
        prisma.customer.findMany({
          where: { balance: { gt: 0 } },
          select: { name: true, phone: true, balance: true, salesPerson: { select: { name: true } } },
          orderBy: { balance: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "财务对账与票据摘要",
        summary: `收款 ${paymentCount} 笔，金额 ${money(Number(paymentSum._sum?.amount ?? 0))}；发票 ${invoiceCount} 张，金额 ${money(Number(invoiceSum._sum.amount ?? 0))}。`,
        href: "/dashboard/finance/statements",
        details: [
          ...details([
            ["周期", input.period],
            ["收款笔数", paymentCount],
            ["收款金额", money(Number(paymentSum._sum?.amount ?? 0))],
            ["发票张数", invoiceCount],
            ["发票金额", money(Number(invoiceSum._sum.amount ?? 0))],
            ["税额", money(Number(invoiceSum._sum.taxAmount ?? 0))],
          ]),
          ...debtors.map((customer) => ({
            label: customer.name,
            value: `${customer.phone}｜欠款 ${money(Number(customer.balance))}｜销售 ${customer.salesPerson?.name ?? "未分配"}`,
          })),
        ],
      };
    },
  },
  {
    name: "channel_pipeline_summary",
    title: "渠道线索询价报价摘要",
    description: "查询线索、询价、报价、推广码、新品推送和渠道冲突漏斗。",
    riskLevel: "READ",
    access: { permission: "channel:manage" },
    inputSchema: summaryQuerySchema,
    handler: async (input, context) => {
      const query = String(input.query ?? "").trim();
      const salespersonFilter = context.role === "SALESPERSON" ? { salespersonId: context.user.id } : {};
      const leadWhere: Prisma.LeadWhereInput = {
        ...periodCreatedAtWhere(input.period),
        ...salespersonFilter,
        ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } }, { notes: { contains: query, mode: "insensitive" } }] } : {}),
      };
      const inquiryWhere: Prisma.InquiryWhereInput = { ...periodCreatedAtWhere(input.period), ...salespersonFilter };
      const quoteWhere: Prisma.QuoteWhereInput = {
        ...periodCreatedAtWhere(input.period),
        ...(context.role === "SALESPERSON" ? { inquiry: { salespersonId: context.user.id } } : {}),
      };
      const [leadStatuses, inquiryStatuses, quoteStatuses, promoterCount, pushCount, openConflicts, recentLeads] = await Promise.all([
        prisma.lead.groupBy({ by: ["status"], where: leadWhere, _count: { _all: true } }),
        prisma.inquiry.groupBy({ by: ["status"], where: inquiryWhere, _count: { _all: true } }),
        prisma.quote.groupBy({ by: ["status"], where: quoteWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
        prisma.promoterCode.count({ where: context.role === "SALESPERSON" ? { salespersonId: context.user.id } : {} }),
        prisma.productPush.count({ where: periodCreatedAtWhere(input.period) }),
        prisma.channelConflict.count({ where: { status: "OPEN", ...(context.role === "SALESPERSON" ? { ownerId: context.user.id } : {}) } }),
        prisma.lead.findMany({
          where: leadWhere,
          include: { salesperson: { select: { name: true } }, dealer: { select: { shopName: true } } },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);

      return {
        title: "渠道线索询价报价摘要",
        summary: `推广码 ${promoterCount} 个，新品推送 ${pushCount} 条，未关闭冲突 ${openConflicts} 个。`,
        href: "/dashboard/leads",
        details: [
          ...leadStatuses.map((row) => ({ label: `线索 ${row.status}`, value: `${row._count._all} 条` })),
          ...inquiryStatuses.map((row) => ({ label: `询价 ${row.status}`, value: `${row._count._all} 张` })),
          ...quoteStatuses.map((row) => ({ label: `报价 ${row.status}`, value: `${row._count._all} 张｜${money(Number(row._sum.totalAmount ?? 0))}` })),
          ...recentLeads.map((lead) => ({
            label: lead.name ?? lead.phone ?? lead.id,
            value: `${lead.scene}｜${lead.status}｜销售 ${lead.salesperson?.name ?? "未分配"}｜经销商 ${lead.dealer?.shopName ?? "-"}｜${compactDate(lead.createdAt)}`,
          })),
        ],
      };
    },
  },
  {
    name: "dealer_promotion_summary",
    title: "经销商推广与线索摘要",
    description: "经销商查询自己的推广码、扫码线索、询价和订单转化。",
    riskLevel: "READ",
    access: { roles: ["DEALER"] },
    inputSchema: summaryQuerySchema,
    handler: async (input, context) => {
      const dealer = await prisma.dealer.findUnique({ where: { customerId: context.user.id }, select: { id: true, shopName: true } });
      if (!dealer) throw new Error("未找到当前经销商档案");
      const where = periodCreatedAtWhere(input.period);
      const [codes, leadStatuses, inquiryStatuses, routingCount, recentLeads] = await Promise.all([
        prisma.promoterCode.findMany({ where: { dealerId: dealer.id }, orderBy: { createdAt: "desc" }, take: input.limit }),
        prisma.lead.groupBy({ by: ["status"], where: { ...where, dealerId: dealer.id }, _count: { _all: true } }),
        prisma.inquiry.groupBy({ by: ["status"], where: { ...where, dealerId: dealer.id }, _count: { _all: true } }),
        prisma.orderRouting.count({ where: { dealerId: dealer.id } }),
        prisma.lead.findMany({ where: { ...where, dealerId: dealer.id }, orderBy: { createdAt: "desc" }, take: input.limit }),
      ]);

      return {
        title: "经销商推广与线索摘要",
        summary: `${dealer.shopName} 有 ${codes.length} 个推广码，历史派单 ${routingCount} 个。`,
        href: "/dealer/promotion",
        details: [
          ...codes.map((code) => ({ label: code.label, value: `${code.code}｜扫码 ${code.scanCount}｜线索 ${code.leadCount}｜订单 ${code.orderCount}` })),
          ...leadStatuses.map((row) => ({ label: `线索 ${row.status}`, value: `${row._count._all} 条` })),
          ...inquiryStatuses.map((row) => ({ label: `询价 ${row.status}`, value: `${row._count._all} 张` })),
          ...recentLeads.map((lead) => ({ label: lead.name ?? lead.phone ?? lead.id, value: `${lead.scene}｜${lead.status}｜${compactDate(lead.createdAt)}` })),
        ],
      };
    },
  },
  {
    name: "admin_dealer_promotion_summary",
    title: "经销商推广代查",
    description: "管理员或销售查询指定经销商推广码、扫码线索、询价和订单转化。",
    riskLevel: "READ",
    access: { permission: "channel:manage" },
    inputSchema: dealerLookupSchema,
    handler: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const where = periodCreatedAtWhere(input.period);
      const [codes, leadStatuses, inquiryStatuses, routingCount, recentLeads] = await Promise.all([
        prisma.promoterCode.findMany({ where: { dealerId: dealer.id }, orderBy: { createdAt: "desc" }, take: input.limit }),
        prisma.lead.groupBy({ by: ["status"], where: { ...where, dealerId: dealer.id }, _count: { _all: true } }),
        prisma.inquiry.groupBy({ by: ["status"], where: { ...where, dealerId: dealer.id }, _count: { _all: true } }),
        prisma.orderRouting.count({ where: { dealerId: dealer.id } }),
        prisma.lead.findMany({ where: { ...where, dealerId: dealer.id }, orderBy: { createdAt: "desc" }, take: input.limit }),
      ]);

      return {
        title: "经销商推广代查",
        summary: `${dealer.shopName} 有 ${codes.length} 个推广码，历史派单 ${routingCount} 个。`,
        href: `/dashboard/dealers?query=${encodeURIComponent(dealer.shopName)}`,
        details: [
          ...details([
            ["门店", dealer.shopName],
            ["联系人", `${dealer.customer.name} ${dealer.customer.phone}`],
            ["接单状态", dealer.isAccepting ? "可接单" : "暂停接单"],
            ["服务区域", dealer.zone],
          ]),
          ...codes.map((code) => ({ label: code.label, value: `${code.code}｜扫码 ${code.scanCount}｜线索 ${code.leadCount}｜订单 ${code.orderCount}` })),
          ...leadStatuses.map((row) => ({ label: `线索 ${row.status}`, value: `${row._count._all} 条` })),
          ...inquiryStatuses.map((row) => ({ label: `询价 ${row.status}`, value: `${row._count._all} 张` })),
          ...recentLeads.map((lead) => ({ label: lead.name ?? lead.phone ?? lead.id, value: `${lead.scene}｜${lead.status}｜${compactDate(lead.createdAt)}` })),
        ],
      };
    },
  },
  {
    name: "admin_dealer_incoming_orders",
    title: "经销商待接订单代查",
    description: "管理员或销售查询指定经销商当前待接订单。",
    riskLevel: "READ",
    access: { permission: "orders:view" },
    inputSchema: dealerLookupSchema.pick({ dealerQuery: true, limit: true }),
    handler: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const routings = await prisma.orderRouting.findMany({
        where: { dealerId: dealer.id, status: "PENDING" },
        include: { order: { include: { customer: { select: { name: true, phone: true } }, items: true } } },
        orderBy: { assignedAt: "asc" },
        take: input.limit,
      });
      return {
        title: "经销商待接订单代查",
        summary: routings.length ? `${dealer.shopName} 当前有 ${routings.length} 个待接订单。` : `${dealer.shopName} 当前没有待接订单。`,
        href: "/dashboard/orders",
        details: routings.map((routing) => ({
          label: routing.order.orderNo,
          value: `${routing.order.customer.name} ${routing.order.customer.phone}｜${money(Number(routing.order.payableAmount))}｜${routing.order.items.reduce((sum, item) => sum + item.quantity, 0)} 件｜派单 ${compactDate(routing.assignedAt)}`,
        })),
      };
    },
  },
  {
    name: "admin_dealer_settlement_summary",
    title: "经销商结算代查",
    description: "管理员或财务查询指定经销商本月完成订单和预估结算。",
    riskLevel: "READ",
    access: { permission: "finance:manage" },
    inputSchema: dealerLookupSchema.pick({ dealerQuery: true, limit: true }),
    handler: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const routings = await prisma.orderRouting.findMany({
        where: { dealerId: dealer.id, status: "ACCEPTED", order: { status: "COMPLETED", updatedAt: { gte: start } } },
        include: { order: { include: { customer: { select: { name: true } } } } },
        orderBy: { updatedAt: "desc" },
        take: input.limit,
      });
      const amount = routings.reduce((sum, routing) => sum + Number(routing.order.payableAmount), 0);
      return {
        title: "经销商结算代查",
        summary: `${dealer.shopName} 本月完成 ${routings.length} 单，预估结算 ${money(amount * 0.9)}。`,
        href: "/dashboard/finance/statements",
        details: [
          ...details([
            ["门店", dealer.shopName],
            ["完成订单", routings.length],
            ["订单金额", money(amount)],
            ["预估结算", money(amount * 0.9)],
          ]),
          ...routings.slice(0, 8).map((routing) => ({ label: routing.order.orderNo, value: `${routing.order.customer.name}｜${money(Number(routing.order.payableAmount))}｜${compactDate(routing.order.updatedAt)}` })),
        ],
      };
    },
  },
  {
    name: "admin_dealer_stock_summary",
    title: "经销商库存代查",
    description: "管理员或销售查询指定经销商上报的门店库存。",
    riskLevel: "READ",
    access: { permission: "inventory:manage" },
    inputSchema: dealerLookupSchema.pick({ dealerQuery: true, limit: true }),
    handler: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const stocks = await prisma.dealerStock.findMany({
        where: { dealerId: dealer.id },
        include: { product: { select: { name: true, sku: true, stock: true, safeStock: true, retailPrice: true } } },
        orderBy: { reportedAt: "desc" },
        take: input.limit,
      });
      const total = stocks.reduce((sum, row) => sum + row.stock, 0);
      return {
        title: "经销商库存代查",
        summary: stocks.length ? `${dealer.shopName} 最近上报 ${stocks.length} 个 SKU，门店库存合计 ${total} 件。` : `${dealer.shopName} 暂无门店库存上报。`,
        href: `/dashboard/dealers?query=${encodeURIComponent(dealer.shopName)}`,
        details: stocks.map((stock) => ({
          label: stock.product.name,
          value: `${stock.product.sku}｜门店 ${stock.stock} 件｜总仓 ${stock.product.stock}｜安全库存 ${stock.product.safeStock}｜上报 ${compactDate(stock.reportedAt)}`,
        })),
      };
    },
  },
  {
    name: "search_products",
    title: "查询商品",
    description: "按商品名、品牌、规格、SKU 查询商品价格、库存和状态。",
    riskLevel: "READ",
    inputSchema: productSearchSchema,
    handler: async (input) => {
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: input.query, mode: "insensitive" } },
            { sku: { contains: input.query, mode: "insensitive" } },
            { brand: { name: { contains: input.query, mode: "insensitive" } } },
            { category: { name: { contains: input.query, mode: "insensitive" } } },
          ],
        },
        include: { brand: { select: { name: true } }, category: { select: { name: true } } },
        orderBy: [{ status: "asc" }, { salesCount: "desc" }],
        take: input.limit,
      });
      return {
        title: "商品查询结果",
        summary: products.length ? `找到 ${products.length} 个相关商品。` : "没有找到相关商品，可以换个商品名或品牌再试。",
        details: products.map((product) => ({
          label: product.name,
          value: `${product.brand.name}｜${product.spec ?? product.unit}｜${money(Number(product.retailPrice))}｜库存 ${product.stock}｜${product.status}`,
        })),
        data: products.map((product) => ({ id: product.id, name: product.name, stock: product.stock, retailPrice: Number(product.retailPrice) })),
      };
    },
  },
  {
    name: "customer_context",
    title: "客户资料摘要",
    description: "读取当前客户默认地址、近期订单和常用信息。",
    riskLevel: "READ",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({}),
    handler: async (_, context) => {
      const customer = await prisma.customer.findUnique({
        where: { id: context.user.id },
        include: {
          addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }], take: 1 },
          orders: { where: { parentId: null }, orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
      if (!customer) throw new Error("客户不存在");
      const debt = customer.orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
      const address = customer.addresses[0];
      return {
        title: "客户资料摘要",
        summary: `${customer.name}，近 5 单中待付款 ${money(debt)}。`,
        details: details([
          ["手机号", customer.phone],
          ["默认地址", address ? `${address.city}${address.district}${address.detail}` : "未设置"],
          ["近期订单", `${customer.orders.length} 单`],
          ["待付款", money(debt)],
        ]),
      };
    },
  },
  {
    name: "customer_submit_order",
    title: "AI 下单确认",
    description: "根据客户自然语言生成下单确认卡，确认后创建订单或询价。",
    riskLevel: "WRITE",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({
      productQuery: z.string().trim().min(1, "请说明要买的商品"),
      quantity: z.coerce.number().int().min(1).max(9999),
      payMethod: z.enum(["WECHAT", "CASH", "TRANSFER", "CREDIT"]).default("WECHAT"),
      addressId: z.string().optional().nullable(),
      remark: z.string().max(200).optional(),
    }),
    buildConfirmation: async (input, context) => {
      const draft = await buildCustomerOrderDraft(input, context);
      return {
        title: draft.shouldCreateInquiry ? "确认提交询价" : "确认提交订单",
        summary: `${input.quantity} 件 ${draft.product.name}，预计 ${money(draft.totalAmount)}，送到 ${draft.address.district}${draft.address.detail}。`,
        details: details([
          ["商品", draft.product.name],
          ["单价", money(Number(draft.product.retailPrice))],
          ["数量", input.quantity],
          ["金额", money(draft.totalAmount)],
          ["收货人", `${draft.address.name} ${draft.address.phone}`],
          ["地址", `${draft.address.city}${draft.address.district}${draft.address.detail}`],
          ["处理方式", draft.shouldCreateInquiry ? `生成询价单（大单阈值 ${money(draft.bulkOrderAmount)}）` : "直接生成订单"],
        ]),
        confirmLabel: draft.shouldCreateInquiry ? "确认提交询价" : "确认下单",
      };
    },
    handler: createCustomerOrderFromAi,
  },
  {
    name: "customer_orders",
    title: "我的订单",
    description: "客户查询自己的订单、配送和售后状态。",
    riskLevel: "READ",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) }),
    handler: async (input, context) => {
      const orders = await prisma.order.findMany({
        where: { customerId: context.user.id, parentId: null },
        include: { delivery: true, items: true },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return {
        title: "我的订单",
        summary: orders.length ? `最近 ${orders.length} 个订单如下。` : "还没有订单记录。",
        details: orders.map((order) => ({
          label: order.orderNo,
          value: `${order.status}｜${money(Number(order.payableAmount))}｜${order.items.reduce((sum, item) => sum + item.quantity, 0)} 件｜配送 ${order.delivery?.status ?? "未发货"}`,
        })),
      };
    },
  },
  {
    name: "customer_receivables",
    title: "我的待付款",
    description: "客户查询自己的赊账和待付款信息。",
    riskLevel: "READ",
    access: { roles: ["CONSUMER"] },
    inputSchema: z.object({}),
    handler: async (_, context) => {
      const orders = await prisma.order.findMany({
        where: { customerId: context.user.id, parentId: null, status: { in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "REFUNDING"] } },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      const rows = orders
        .map((order) => ({ orderNo: order.orderNo, remaining: Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)) }))
        .filter((row) => row.remaining > 0);
      return {
        title: "我的待付款",
        summary: rows.length ? `当前待付款合计 ${money(rows.reduce((sum, item) => sum + item.remaining, 0))}。` : "当前没有待付款订单。",
        details: rows.slice(0, 8).map((row) => ({ label: row.orderNo, value: money(row.remaining) })),
      };
    },
  },
  {
    name: "business_overview",
    title: "经营总览",
    description: "查询销售额、订单数、客户数、回款、毛利、库存预警和待处理事项。",
    riskLevel: "READ",
    access: { permission: "dashboard:view" },
    inputSchema: periodSchema,
    handler: async (input) => {
      const start = startForPeriod(input.period);
      const [orders, payments, customers, stockRows, pendingOrders, openConflicts] = await Promise.all([
        prisma.order.findMany({
          where: { parentId: null, status: { in: revenueStatuses }, createdAt: { gte: start } },
          include: { items: { include: { product: { select: { costPrice: true } } } } },
        }),
        prisma.payment.findMany({ where: { type: "RECEIVE", status: "COMPLETED", paidAt: { gte: start } } }),
        prisma.customer.count({ where: { createdAt: { gte: start } } }),
        prisma.product.findMany({ select: { stock: true, safeStock: true } }),
        prisma.order.count({ where: { parentId: null, status: { in: ["PENDING_PAYMENT", "PAID", "CONFIRMED"] } } }),
        prisma.channelConflict.count({ where: { status: { in: ["OPEN", "PROCESSING"] } } }),
      ]);
      const lowStock = stockRows.filter((product) => product.stock <= product.safeStock).length;
      const sales = orders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
      const profit = orders.reduce((sum, order) => sum + order.items.reduce((inner, item) => inner + (Number(item.unitPrice) - Number(item.product.costPrice)) * item.quantity, 0), 0);
      const income = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        title: "经营总览",
        summary: `本期销售 ${money(sales)}，回款 ${money(income)}，毛利约 ${money(profit)}。`,
        details: details([
          ["订单数", orders.length],
          ["新增客户", customers],
          ["待处理订单", pendingOrders],
          ["库存预警 SKU", lowStock],
          ["未关闭渠道冲突", openConflicts],
        ]),
      };
    },
  },
  {
    name: "order_summary",
    title: "订单摘要",
    description: "查询后台订单总数、状态分布、最近订单、客户、金额和配送状态。",
    riskLevel: "READ",
    access: { permission: "orders:view" },
    inputSchema: orderSummarySchema,
    handler: async (input, context) => {
      const query = String(input.query ?? "").trim();
      const scope: Prisma.OrderWhereInput =
        context.role === "SALESPERSON" ? { OR: [{ salesPersonId: context.user.id }, { customer: { salesPersonId: context.user.id } }] } : {};
      const where: Prisma.OrderWhereInput = {
        parentId: null,
        ...scope,
        ...periodCreatedAtWhere(input.period),
        ...(input.status ? { status: input.status as OrderStatus } : {}),
        ...(query
          ? {
              OR: [
                { orderNo: { contains: query, mode: "insensitive" } },
                { customer: { name: { contains: query, mode: "insensitive" } } },
                { customer: { phone: { contains: query, mode: "insensitive" } } },
                { items: { some: { productName: { contains: query, mode: "insensitive" } } } },
              ],
            }
          : {}),
      };
      const [count, amount, statusRows, recent] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.aggregate({ where, _sum: { payableAmount: true, paidAmount: true } }),
        prisma.order.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { payableAmount: true } }),
        prisma.order.findMany({
          where,
          include: {
            customer: { select: { name: true, phone: true, salesPerson: { select: { name: true } } } },
            delivery: { select: { status: true } },
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);
      const periodLabel = input.period === "all" ? "累计" : input.period === "day" ? "今日" : input.period === "week" ? "近 7 天" : "本月";
      const paid = Number(amount._sum.paidAmount ?? 0);
      const payable = Number(amount._sum.payableAmount ?? 0);
      return {
        title: "订单摘要",
        summary: `${periodLabel}${query ? `「${query}」` : ""}订单 ${count} 单，应收 ${money(payable)}，已收 ${money(paid)}。`,
        href: "/dashboard/orders",
        details: [
          ...details([
            ["周期", periodLabel],
            ["订单数", count],
            ["应收金额", money(payable)],
            ["已收金额", money(paid)],
            ["未收金额", money(Math.max(0, payable - paid))],
          ]),
          ...statusRows.map((row) => ({
            label: `状态 ${orderStatusLabels[row.status] ?? row.status}`,
            value: `${row._count._all} 单｜${money(Number(row._sum.payableAmount ?? 0))}`,
          })),
          ...recent.map((order) => ({
            label: order.orderNo,
            value: `${order.customer.name}｜${orderStatusLabels[order.status] ?? order.status}｜${money(Number(order.payableAmount))}｜${order._count.items} 项｜${order.customer.salesPerson?.name ?? "未分配"}｜${compactDate(order.createdAt)}`,
          })),
        ],
        data: {
          count,
          payable,
          paid,
          statusRows,
          recent: recent.map((order) => ({
            id: order.id,
            orderNo: order.orderNo,
            status: order.status,
            customerName: order.customer.name,
            customerPhone: order.customer.phone,
            payableAmount: Number(order.payableAmount),
            paidAmount: Number(order.paidAmount),
            deliveryStatus: order.delivery?.status ?? null,
            createdAt: order.createdAt,
          })),
        },
      };
    },
  },
  {
    name: "salesperson_performance",
    title: "销售员业绩",
    description: "查询销售员数量、业绩排行、最好销售员，或按销售员姓名查询销售额、订单数、客户数、回款和排名。",
    riskLevel: "READ",
    access: { permission: "sales:view" },
    inputSchema: z.object({
      salespersonName: z.string().trim().optional().default(""),
      period: z.enum(["day", "week", "month"]).default("month"),
    }),
    handler: async (input, context) => {
      const start = startForPeriod(input.period);
      const requestedName = input.salespersonName.replace(/谁|哪个人|哪位|哪个|哪一个|个人|几个|多少|最好|最高|排名|排行|销售员|业务员/g, "").trim();
      if (context.role !== "SALESPERSON" && !requestedName) {
        const [allSalespeople, totalSalespeople] = await Promise.all([
          prisma.user.findMany({ where: { role: "SALESPERSON", isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
          prisma.user.count({ where: { role: "SALESPERSON" } }),
        ]);

        const rows = await Promise.all(
          allSalespeople.map(async (person) => {
            const [orders, payments, customerCount] = await Promise.all([
              prisma.order.findMany({
                where: {
                  parentId: null,
                  status: { in: revenueStatuses },
                  createdAt: { gte: start },
                  OR: [{ salesPersonId: person.id }, { salesPersonId: null, customer: { salesPersonId: person.id } }],
                },
                select: { customerId: true, payableAmount: true, paidAmount: true },
              }),
              prisma.payment.findMany({
                where: { status: "COMPLETED", type: "RECEIVE", paidAt: { gte: start }, customer: { salesPersonId: person.id } },
                select: { amount: true },
              }),
              prisma.customer.count({ where: { salesPersonId: person.id } }),
            ]);
            return {
              id: person.id,
              name: person.name ?? "未命名销售员",
              sales: orders.reduce((sum, order) => sum + Number(order.payableAmount), 0),
              income: payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
              receivable: orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0),
              orders: orders.length,
              customers: customerCount,
              dealCustomers: new Set(orders.map((order) => order.customerId)).size,
            };
          }),
        );
        const ranking = rows.sort((left, right) => right.sales - left.sales || right.orders - left.orders);
        const best = ranking[0];
        return {
          title: "销售员业绩排行",
          summary: best
            ? `当前启用销售员 ${allSalespeople.length} 个，本期业绩最好的是 ${best.name}，销售 ${money(best.sales)}，${best.orders} 单。`
            : "当前没有启用销售员。",
          details: [
            ...details([
              ["启用销售员", allSalespeople.length],
              ["全部销售员", totalSalespeople],
              ["本期最高业绩", best ? `${best.name} ${money(best.sales)}` : "暂无"],
            ]),
            ...ranking.slice(0, 8).map((row, index) => ({
              label: `第 ${index + 1} 名 · ${row.name}`,
              value: `销售 ${money(row.sales)}｜订单 ${row.orders}｜成交客户 ${row.dealCustomers}｜名下客户 ${row.customers}｜回款 ${money(row.income)}｜未回款 ${money(row.receivable)}`,
            })),
          ],
          data: { totalSalespeople, activeSalespeople: allSalespeople.length, ranking },
        };
      }
      const salesperson =
        context.role === "SALESPERSON"
          ? await prisma.user.findUnique({ where: { id: context.user.id }, select: { id: true, name: true } })
          : await prisma.user.findFirst({
              where: { role: "SALESPERSON", ...(requestedName ? { name: { contains: requestedName, mode: "insensitive" } } : {}) },
              select: { id: true, name: true },
              orderBy: { createdAt: "asc" },
            });
      if (!salesperson) throw new Error("未找到销售员");
      const [orders, payments, customerCount, allSalespeople] = await Promise.all([
        prisma.order.findMany({
          where: {
            parentId: null,
            status: { in: revenueStatuses },
            createdAt: { gte: start },
            OR: [{ salesPersonId: salesperson.id }, { salesPersonId: null, customer: { salesPersonId: salesperson.id } }],
          },
          select: { customerId: true, payableAmount: true, paidAmount: true },
        }),
        prisma.payment.findMany({
          where: { status: "COMPLETED", type: "RECEIVE", paidAt: { gte: start }, customer: { salesPersonId: salesperson.id } },
          select: { amount: true },
        }),
        prisma.customer.count({ where: { salesPersonId: salesperson.id } }),
        prisma.user.findMany({ where: { role: "SALESPERSON", isActive: true }, select: { id: true, name: true } }),
      ]);
      const sales = orders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
      const receivable = orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
      const income = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const rankRows = await Promise.all(
        allSalespeople.map(async (person) => {
          const personOrders = await prisma.order.findMany({
            where: {
              parentId: null,
              status: { in: revenueStatuses },
              createdAt: { gte: start },
              OR: [{ salesPersonId: person.id }, { salesPersonId: null, customer: { salesPersonId: person.id } }],
            },
            select: { payableAmount: true },
          });
          return { id: person.id, sales: personOrders.reduce((sum, order) => sum + Number(order.payableAmount), 0) };
        }),
      );
      const rank = rankRows.sort((a, b) => b.sales - a.sales).findIndex((row) => row.id === salesperson.id) + 1;
      return {
        title: `${salesperson.name} 的业绩`,
        summary: `${salesperson.name} 本期销售 ${money(sales)}，${orders.length} 单，排名第 ${rank || "-"}。`,
        details: details([
          ["销售额", money(sales)],
          ["订单数", orders.length],
          ["成交客户", new Set(orders.map((order) => order.customerId)).size],
          ["名下客户", customerCount],
          ["回款", money(income)],
          ["未回款", money(receivable)],
          ["排名", rank ? `第 ${rank}` : "-"],
        ]),
      };
    },
  },
  {
    name: "search_customers",
    title: "客户查询",
    description: "按姓名、手机号、标签或归属销售员查询客户、欠款和最近订单。",
    riskLevel: "READ",
    access: { permission: "customers:view" },
    inputSchema: z.object({ query: z.string().trim().optional().default(""), limit: z.coerce.number().int().min(1).max(20).default(8) }),
    handler: async (input, context) => {
      const scope: Prisma.CustomerWhereInput = context.role === "SALESPERSON" ? { salesPersonId: context.user.id } : {};
      const customers = await prisma.customer.findMany({
        where: {
          AND: [
            scope,
            input.query
              ? {
                  OR: [
                    { name: { contains: input.query, mode: "insensitive" } },
                    { phone: { contains: input.query, mode: "insensitive" } },
                    { tags: { some: { name: { contains: input.query, mode: "insensitive" } } } },
                    { salesPerson: { name: { contains: input.query, mode: "insensitive" } } },
                  ],
                }
              : {},
          ],
        },
        include: {
          salesPerson: { select: { name: true } },
          orders: { where: { parentId: null }, orderBy: { createdAt: "desc" }, take: 5 },
        },
        take: input.limit,
        orderBy: { updatedAt: "desc" },
      });
      return {
        title: "客户查询结果",
        summary: customers.length ? `找到 ${customers.length} 个客户。` : "没有找到匹配客户。",
        details: customers.map((customer) => {
          const debt = customer.orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
          return {
            label: `${customer.name} · ${customer.phone}`,
            value: `业务员 ${customer.salesPerson?.name ?? "未分配"}｜近单 ${customer.orders.length}｜欠款 ${money(debt)}`,
          };
        }),
      };
    },
  },
  {
    name: "customer_analytics_summary",
    title: "客户统计分析",
    description: "查询当前权限范围内客户总数、客户类型分布、归属情况和消费最高客户。",
    riskLevel: "READ",
    access: { permission: "customers:view" },
    inputSchema: z.object({
      period: z.enum(["all", "day", "week", "month"]).optional().default("all"),
      limit: z.coerce.number().int().min(1).max(20).default(5),
    }),
    handler: async (input, context) => {
      const scope: Prisma.CustomerWhereInput = context.role === "SALESPERSON" ? { salesPersonId: context.user.id } : {};
      const start = input.period && input.period !== "all" ? startForPeriod(input.period) : null;
      const orderScope: Prisma.OrderWhereInput = {
        parentId: null,
        status: { in: revenueStatuses },
        ...(start ? { createdAt: { gte: start } } : {}),
        ...(context.role === "SALESPERSON" ? { customer: { salesPersonId: context.user.id } } : {}),
      };

      const [totalCustomers, consumerCustomers, dealerCustomers, verifiedCustomers, assignedCustomers, orders] = await Promise.all([
        prisma.customer.count({ where: scope }),
        prisma.customer.count({ where: { ...scope, type: "CONSUMER" } }),
        prisma.customer.count({ where: { ...scope, type: "DEALER" } }),
        prisma.customer.count({ where: { ...scope, isVerified: true } }),
        prisma.customer.count({ where: { ...scope, salesPersonId: { not: null } } }),
        prisma.order.findMany({
          where: orderScope,
          select: {
            customerId: true,
            payableAmount: true,
            customer: { select: { name: true, phone: true, type: true, salesPerson: { select: { name: true } } } },
          },
        }),
      ]);

      const spendingRows = Array.from(
        orders
          .reduce((map, order) => {
            const existing = map.get(order.customerId) ?? {
              customerId: order.customerId,
              name: order.customer.name,
              phone: order.customer.phone,
              type: order.customer.type,
              salesPersonName: order.customer.salesPerson?.name ?? "未分配",
              amount: 0,
              orders: 0,
            };
            existing.amount += Number(order.payableAmount);
            existing.orders += 1;
            map.set(order.customerId, existing);
            return map;
          }, new Map<string, { customerId: string; name: string; phone: string; type: string; salesPersonName: string; amount: number; orders: number }>())
          .values(),
      ).sort((left, right) => right.amount - left.amount);

      const topCustomer = spendingRows[0];
      const periodLabel = input.period === "day" ? "今日" : input.period === "week" ? "近 7 天" : input.period === "month" ? "本月" : "累计";
      return {
        title: "客户统计分析",
        summary: topCustomer
          ? `当前共有 ${totalCustomers} 个客户，${periodLabel}消费最高的是 ${topCustomer.name}，消费 ${money(topCustomer.amount)}。`
          : `当前共有 ${totalCustomers} 个客户，${periodLabel}暂无成交消费记录。`,
        details: [
          ...details([
            ["客户总数", totalCustomers],
            ["消费者客户", consumerCustomers],
            ["经销商客户", dealerCustomers],
            ["已认证客户", verifiedCustomers],
            ["已分配销售员", assignedCustomers],
            ["未分配销售员", Math.max(0, totalCustomers - assignedCustomers)],
            ["统计口径", periodLabel],
          ]),
          ...spendingRows.slice(0, input.limit).map((row) => ({
            label: `${row.name} · ${row.phone}`,
            value: `${row.type}｜消费 ${money(row.amount)}｜订单 ${row.orders}｜业务员 ${row.salesPersonName}`,
          })),
        ],
        data: {
          totalCustomers,
          consumerCustomers,
          dealerCustomers,
          verifiedCustomers,
          assignedCustomers,
          topCustomers: spendingRows.slice(0, input.limit).map((row) => ({
            customerId: row.customerId,
            name: row.name,
            phone: row.phone,
            type: row.type,
            amount: row.amount,
            orders: row.orders,
            salesPersonName: row.salesPersonName,
          })),
        },
      };
    },
  },
  {
    name: "customer_purchase_history",
    title: "客户购买历史",
    description: "按客户姓名或手机号查询最近购买过的商品、订单金额和订单状态。",
    riskLevel: "READ",
    access: { permission: "customers:view" },
    inputSchema: z.object({ customerQuery: z.string().trim().min(1, "请说明客户姓名或手机号"), limit: z.coerce.number().int().min(1).max(20).default(8) }),
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id, parentId: null },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      const productStats = new Map<string, { quantity: number; amount: number }>();
      for (const order of orders) {
        for (const item of order.items) {
          const current = productStats.get(item.productName) ?? { quantity: 0, amount: 0 };
          current.quantity += item.quantity;
          current.amount += Number(item.totalAmount);
          productStats.set(item.productName, current);
        }
      }
      const topProducts = Array.from(productStats.entries())
        .sort(([, left], [, right]) => right.amount - left.amount)
        .slice(0, 5);
      const totalAmount = orders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
      const orderRows = orders.slice(0, 6).map((order) => ({
        label: order.orderNo,
        value: `${order.status}｜${money(Number(order.payableAmount))}｜${order.items.map((item) => `${item.productName}×${item.quantity}`).join("、")}`,
      }));
      return {
        title: "客户购买历史",
        summary: orders.length
          ? `${customer.name} 最近 ${orders.length} 单，购买金额 ${money(totalAmount)}，主要商品：${topProducts.map(([name]) => name).join("、") || "暂无"}。`
          : `${customer.name} 暂无订单购买记录。`,
        href: `/dashboard/customers/${customer.id}`,
        details: [
          ...details([
            ["客户", `${customer.name} · ${customer.phone}`],
            ["归属销售员", customer.salesPerson?.name ?? "未分配"],
            ["最近订单", orders.length],
            ["购买金额", money(totalAmount)],
          ]),
          ...topProducts.map(([name, stat]) => ({ label: name, value: `${stat.quantity} 件｜${money(stat.amount)}` })),
          ...orderRows,
        ],
        data: {
          customerId: customer.id,
          orders: orders.map((order) => ({
            id: order.id,
            orderNo: order.orderNo,
            status: order.status,
            payableAmount: Number(order.payableAmount),
            items: order.items.map((item) => ({ productName: item.productName, sku: item.sku, quantity: item.quantity })),
          })),
        },
      };
    },
  },
  {
    name: "admin_create_customer",
    title: "新增客户",
    description: "管理员或销售员新增客户账号，并可设置归属销售员、信用额度和标签。",
    riskLevel: "WRITE",
    access: { roles: ["ADMIN", "SALESPERSON"] },
    inputSchema: z.object({
      name: z.string().trim().min(1),
      phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "请填写正确的手机号"),
      customerType: z.enum(["CONSUMER", "DEALER"]).default("CONSUMER"),
      password: z.string().min(6).optional(),
      creditLimit: z.coerce.number().min(0).default(0),
      salesPersonQuery: z.string().trim().optional(),
      tags: z.array(z.string().trim().min(1)).default([]),
    }),
    buildConfirmation: async (input, context) => {
      const salesperson = context.role === "SALESPERSON" ? { id: context.user.id, name: context.user.name ?? "当前销售员" } : await findSalespersonByQuery(input.salesPersonQuery);
      return {
        title: "确认新增客户",
        summary: `准备新增客户 ${input.name}（${input.phone}）。`,
        details: details([
          ["姓名", input.name],
          ["手机号", input.phone],
          ["类型", input.customerType ?? "CONSUMER"],
          ["归属销售员", salesperson?.name ?? "未分配"],
          ["信用额度", money(Number(input.creditLimit ?? 0))],
          ["标签", input.tags?.join("、")],
        ]),
        confirmLabel: "确认新增",
      };
    },
    handler: async (input, context) => {
      const existing = await Promise.all([
        prisma.customer.findUnique({ where: { phone: input.phone }, select: { id: true } }),
        prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
      ]);
      if (existing.some(Boolean)) throw new Error("该手机号已存在账号");
      const salesperson = context.role === "SALESPERSON" ? { id: context.user.id, name: context.user.name ?? "当前销售员" } : await findSalespersonByQuery(input.salesPersonQuery);
      const password = await hash(input.password || "123456", 12);
      const tags = input.tags ?? [];
      const customer = await prisma.customer.create({
        data: {
          name: input.name,
          phone: input.phone,
          password,
          type: input.customerType ?? "CONSUMER",
          isVerified: input.customerType !== "DEALER",
          creditLimit: toMoney(Number(input.creditLimit ?? 0)),
          salesPersonId: salesperson?.id ?? null,
          profile: { create: { preferredCategories: [], tags: { labels: tags } } },
          tags: tags.length
            ? {
                create: tags.map((tag) => ({ name: tag, color: "#f1f5f9", source: "AI_TOOL" })),
              }
            : undefined,
        },
        select: { id: true, name: true, phone: true },
      });
      await logAction({
        module: "客户",
        action: "AI 新增客户",
        targetType: "Customer",
        targetId: customer.id,
        targetName: customer.name,
        after: { ...input, password: "[REDACTED]", salesPersonId: salesperson?.id ?? null },
        summary: `AI 新增客户 ${customer.name}`,
      });
      revalidatePath("/dashboard/customers");
      return {
        title: "客户已新增",
        summary: `${customer.name} 已创建，默认密码为 ${input.password ? "已按输入设置" : "123456"}。`,
        href: `/dashboard/customers/${customer.id}`,
        details: details([
          ["客户", customer.name],
          ["手机号", customer.phone],
          ["归属销售员", salesperson?.name ?? "未分配"],
        ]),
      };
    },
  },
  {
    name: "admin_update_customer_profile",
    title: "修改客户资料",
    description: "管理员或归属销售员修改客户姓名、手机号、信用额度和客户类型。",
    riskLevel: "WRITE",
    access: { roles: ["ADMIN", "SALESPERSON"] },
    inputSchema: z
      .object({
        customerQuery: z.string().trim().min(1),
        name: z.string().trim().min(1).optional(),
        phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "请填写正确的手机号").optional(),
        creditLimit: z.coerce.number().min(0).optional(),
        customerType: z.enum(["CONSUMER", "DEALER"]).optional(),
      })
      .refine((data) => data.name !== undefined || data.phone !== undefined || data.creditLimit !== undefined || data.customerType !== undefined, "请说明要修改的客户字段"),
    buildConfirmation: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      return {
        title: "确认修改客户资料",
        summary: `准备修改客户 ${customer.name} 的资料。`,
        details: details([
          ["客户", `${customer.name} ${customer.phone}`],
          ["新姓名", input.name],
          ["新手机号", input.phone],
          ["信用额度", input.creditLimit === undefined ? undefined : money(Number(input.creditLimit))],
          ["客户类型", input.customerType],
        ]),
        confirmLabel: "确认修改",
      };
    },
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const before = { id: customer.id, name: customer.name, phone: customer.phone, creditLimit: Number(customer.creditLimit), type: customer.type };
      if (input.phone && input.phone !== customer.phone) {
        const exists = await prisma.customer.findUnique({ where: { phone: input.phone }, select: { id: true } });
        if (exists) throw new Error("新手机号已被其他客户使用");
      }
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.creditLimit !== undefined ? { creditLimit: toMoney(Number(input.creditLimit)) } : {}),
          ...(input.customerType ? { type: input.customerType, isVerified: input.customerType !== "DEALER" ? true : customer.isVerified } : {}),
        },
        select: { id: true, name: true, phone: true, creditLimit: true, type: true },
      });
      await logAction({
        module: "客户",
        action: "AI 修改客户资料",
        targetType: "Customer",
        targetId: customer.id,
        targetName: updated.name,
        before,
        after: updated,
        summary: `AI 修改客户 ${updated.name} 资料`,
      });
      revalidatePath("/dashboard/customers");
      revalidatePath(`/dashboard/customers/${customer.id}`);
      return {
        title: "客户资料已更新",
        summary: `${updated.name} 的客户资料已更新。`,
        href: `/dashboard/customers/${customer.id}`,
        details: details([
          ["姓名", updated.name],
          ["手机号", updated.phone],
          ["信用额度", money(Number(updated.creditLimit))],
          ["类型", updated.type],
        ]),
      };
    },
  },
  {
    name: "admin_assign_customer_salesperson",
    title: "调整客户归属销售员",
    description: "管理员调整客户归属销售员。",
    riskLevel: "WRITE",
    access: { roles: ["ADMIN"] },
    inputSchema: z.object({ customerQuery: z.string().trim().min(1), salesPersonQuery: z.string().trim().min(1) }),
    buildConfirmation: async (input, context) => {
      const [customer, salesperson] = await Promise.all([findCustomerByQuery(input.customerQuery!, context), findSalespersonByQuery(input.salesPersonQuery)]);
      return {
        title: "确认调整客户归属",
        summary: `准备把 ${customer.name} 调整给 ${salesperson?.name ?? ""}。`,
        details: details([
          ["客户", `${customer.name} ${customer.phone}`],
          ["当前销售员", customer.salesPerson?.name ?? "未分配"],
          ["目标销售员", salesperson?.name],
        ]),
        confirmLabel: "确认调整",
      };
    },
    handler: async (input, context) => {
      const [customer, salesperson] = await Promise.all([findCustomerByQuery(input.customerQuery!, context), findSalespersonByQuery(input.salesPersonQuery)]);
      if (!salesperson) throw new Error("未找到销售员");
      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: { salesPersonId: salesperson.id },
        select: { id: true, name: true, phone: true },
      });
      await logAction({
        module: "客户",
        action: "AI 调整归属销售员",
        targetType: "Customer",
        targetId: customer.id,
        targetName: customer.name,
        before: { salesPersonId: customer.salesPersonId, salesPersonName: customer.salesPerson?.name ?? null },
        after: { salesPersonId: salesperson.id, salesPersonName: salesperson.name },
        summary: `客户 ${customer.name} 已调整给 ${salesperson.name}`,
      });
      revalidatePath("/dashboard/customers");
      revalidatePath(`/dashboard/customers/${customer.id}`);
      return {
        title: "客户归属已调整",
        summary: `${updated.name} 已归属给 ${salesperson.name}。`,
        href: `/dashboard/customers/${updated.id}`,
        details: details([
          ["客户", updated.name],
          ["销售员", salesperson.name],
        ]),
      };
    },
  },
  {
    name: "admin_update_customer_tags",
    title: "调整客户标签",
    description: "管理员或归属销售员替换、追加或移除客户标签。",
    riskLevel: "WRITE",
    access: { roles: ["ADMIN", "SALESPERSON"] },
    inputSchema: z.object({
      customerQuery: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)).min(1),
      mode: z.enum(["replace", "add", "remove"]).default("replace"),
    }),
    buildConfirmation: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      return {
        title: "确认调整客户标签",
        summary: `准备${input.mode === "replace" ? "替换" : input.mode === "remove" ? "移除" : "追加"} ${customer.name} 的标签。`,
        details: details([
          ["客户", customer.name],
          ["当前标签", customer.tags.map((tag) => tag.name).join("、") || "无"],
          ["目标标签", input.tags?.join("、")],
          ["方式", input.mode ?? "replace"],
        ]),
        confirmLabel: "确认调整",
      };
    },
    handler: async (input, context) => {
      const customer = await findCustomerByQuery(input.customerQuery!, context);
      const tags = Array.from(new Set(input.tags ?? []));
      await prisma.$transaction(async (tx) => {
        if (input.mode === "replace") {
          await tx.customerTag.deleteMany({ where: { customerId: customer.id } });
        }
        if (input.mode === "remove") {
          await tx.customerTag.deleteMany({ where: { customerId: customer.id, name: { in: tags } } });
          return;
        }
        await tx.customerTag.createMany({
          data: tags.map((tag) => ({ customerId: customer.id, name: tag, color: "#f1f5f9", source: "AI_TOOL" })),
          skipDuplicates: true,
        });
      });
      await logAction({
        module: "客户",
        action: "AI 调整客户标签",
        targetType: "Customer",
        targetId: customer.id,
        targetName: customer.name,
        before: customer.tags.map((tag) => tag.name),
        after: { mode: input.mode, tags },
        summary: `AI 调整客户 ${customer.name} 标签`,
      });
      revalidatePath("/dashboard/customers");
      revalidatePath(`/dashboard/customers/${customer.id}`);
      return {
        title: "客户标签已调整",
        summary: `${customer.name} 的标签已更新。`,
        href: `/dashboard/customers/${customer.id}`,
        details: details([
          ["客户", customer.name],
          ["标签", tags.join("、")],
          ["方式", input.mode ?? "replace"],
        ]),
      };
    },
  },
  {
    name: "product_operations_summary",
    title: "商品经营查询",
    description: "查询商品销量、库存、毛利、滞销、缺货和价格。",
    riskLevel: "READ",
    access: { permission: "products:view" },
    inputSchema: z.object({
      query: z.string().trim().optional().default(""),
      limit: z.coerce.number().int().min(1).max(20).default(10),
      sort: z.enum(["sales_desc", "stock_desc", "stock_asc"]).optional().default("sales_desc"),
    }),
    handler: async (input) => {
      const where: Prisma.ProductWhereInput = input.query
        ? {
            OR: [
              { name: { contains: input.query, mode: "insensitive" } },
              { sku: { contains: input.query, mode: "insensitive" } },
              { brand: { name: { contains: input.query, mode: "insensitive" } } },
            ],
          }
        : {};
      const orderBy: Prisma.ProductOrderByWithRelationInput[] =
        input.sort === "stock_desc"
          ? [{ stock: "desc" as const }, { salesCount: "desc" as const }]
          : input.sort === "stock_asc"
            ? [{ stock: "asc" as const }, { salesCount: "desc" as const }]
            : [{ salesCount: "desc" as const }, { stock: "asc" as const }];
      const [totalProducts, topStockProduct, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findFirst({
          where,
          include: { brand: { select: { name: true } } },
          orderBy: [{ stock: "desc" }, { salesCount: "desc" }],
        }),
        prisma.product.findMany({
          where,
          include: { brand: { select: { name: true } } },
          orderBy,
          take: input.limit,
        }),
      ]);
      const sortText = input.sort === "stock_desc" ? "按库存从高到低" : input.sort === "stock_asc" ? "按库存从低到高" : "按销量优先";
      const topStockText = topStockProduct ? `库存最多的是 ${topStockProduct.name}，当前库存 ${topStockProduct.stock}。` : "";
      return {
        title: "商品经营查询",
        summary: products.length ? `当前匹配 ${totalProducts} 个商品，${topStockText}${sortText}返回 ${products.length} 个商品经营指标。` : "没有匹配商品。",
        details: products.map((product) => ({
          label: product.name,
          value: `${product.brand.name}｜库存 ${product.stock}/${product.safeStock}｜销量 ${product.salesCount}｜零售 ${money(Number(product.retailPrice))}｜毛利 ${money(Number(product.retailPrice) - Number(product.costPrice))}`,
        })),
      };
    },
  },
  {
    name: "finance_summary",
    title: "财务摘要",
    description: "查询应收款、账龄、收款趋势和客户对账摘要。",
    riskLevel: "READ",
    access: { permission: "finance:manage" },
    inputSchema: periodSchema,
    handler: async (input) => {
      const start = startForPeriod(input.period);
      const [orders, payments, debtCustomers] = await Promise.all([
        prisma.order.findMany({ where: { parentId: null, status: { in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "REFUNDING"] } }, include: { customer: true } }),
        prisma.payment.findMany({ where: { type: "RECEIVE", status: "COMPLETED", paidAt: { gte: start } } }),
        prisma.customer.findMany({
          include: { orders: { where: { parentId: null }, select: { payableAmount: true, paidAmount: true } } },
          take: 200,
        }),
      ]);
      const receivable = orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
      const income = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const topDebt = debtCustomers
        .map((customer) => ({
          name: customer.name,
          debt: customer.orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0),
        }))
        .filter((row) => row.debt > 0)
        .sort((a, b) => b.debt - a.debt)
        .slice(0, 5);
      return {
        title: "财务摘要",
        summary: `当前应收 ${money(receivable)}，本期回款 ${money(income)}。`,
        details: [...details([["应收余额", money(receivable)], ["本期回款", money(income)], ["有欠款客户", topDebt.length]]), ...topDebt.map((row) => ({ label: row.name, value: money(row.debt) }))],
      };
    },
  },
  {
    name: "delivery_summary",
    title: "配送摘要",
    description: "查询待发货、配送中、已送达和异常订单。",
    riskLevel: "READ",
    access: { permission: "delivery:manage" },
    inputSchema: z.object({}),
    handler: async () => {
      const [pending, shipping, deliveredToday, latest] = await Promise.all([
        prisma.order.count({ where: { parentId: null, status: { in: ["PAID", "CONFIRMED"] } } }),
        prisma.order.count({ where: { parentId: null, status: "SHIPPING" } }),
        prisma.order.count({ where: { parentId: null, status: "DELIVERED", updatedAt: { gte: startForPeriod("day") } } }),
        prisma.order.findMany({
          where: { parentId: null, status: { in: ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED"] } },
          include: { customer: { select: { name: true } }, address: true },
          orderBy: { updatedAt: "desc" },
          take: 5,
        }),
      ]);
      return {
        title: "配送摘要",
        summary: `待发货 ${pending} 单，配送中 ${shipping} 单，今日送达 ${deliveredToday} 单。`,
        details: [
          ...details([["待发货", pending], ["配送中", shipping], ["今日送达", deliveredToday]]),
          ...latest.map((order) => ({ label: order.orderNo, value: `${order.status}｜${order.customer.name}｜${order.address.district}${order.address.detail}` })),
        ],
      };
    },
  },
  {
    name: "channel_summary",
    title: "渠道经营摘要",
    description: "查询经销商表现、线索、询价、报价、渠道冲突和新品推送效果。",
    riskLevel: "READ",
    access: { permission: "channel:manage" },
    inputSchema: z.object({}),
    handler: async (input, context) => {
      const salespersonScope = context.role === "SALESPERSON" ? { salespersonId: context.user.id } : {};
      const [dealers, leads, inquiries, quotes, conflicts, pushes] = await Promise.all([
        prisma.dealer.count({ where: context.role === "SALESPERSON" ? { customer: { salesPersonId: context.user.id } } : {} }),
        prisma.lead.count({ where: salespersonScope }),
        prisma.inquiry.count({ where: salespersonScope }),
        prisma.quote.count({ where: context.role === "SALESPERSON" ? { createdById: context.user.id } : {} }),
        prisma.channelConflict.count({ where: { status: { in: ["OPEN", "PROCESSING"] }, ...(context.role === "SALESPERSON" ? { ownerId: context.user.id } : {}) } }),
        prisma.productPush.count({ where: context.role === "SALESPERSON" ? { customer: { salesPersonId: context.user.id } } : {} }),
      ]);
      return {
        title: "渠道经营摘要",
        summary: `经销商 ${dealers} 家，线索 ${leads} 条，未关闭冲突 ${conflicts} 条。`,
        details: details([
          ["经销商", dealers],
          ["线索", leads],
          ["询价", inquiries],
          ["报价", quotes],
          ["未关闭冲突", conflicts],
          ["新品推送", pushes],
        ]),
      };
    },
  },
  {
    name: "admin_update_product_price",
    title: "商品调价",
    description: "管理员调整商品零售价或批发价。",
    riskLevel: "WRITE",
    access: { permission: "products:write" },
    inputSchema: z
      .object({
        productQuery: z.string().trim().min(1, "请说明商品"),
        newRetailPrice: z.coerce.number().positive().optional(),
        adjustRetailPrice: z.coerce.number().optional(),
      })
      .refine((data) => data.newRetailPrice !== undefined || data.adjustRetailPrice !== undefined, "请提供新价格或调整金额"),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const current = Number(product.retailPrice);
      const next = input.newRetailPrice ?? current + (input.adjustRetailPrice ?? 0);
      if (next <= 0) throw new Error("调整后价格必须大于 0");
      return {
        title: "确认商品调价",
        summary: `准备把 ${product.name} 零售价从 ${money(current)} 调整为 ${money(next)}。`,
        details: details([
          ["商品", product.name],
          ["当前零售价", money(current)],
          ["调整后零售价", money(next)],
          ["影响范围", "商城展示、AI 下单和后台开单参考"],
        ]),
        confirmLabel: "确认调价",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const before = { id: product.id, name: product.name, retailPrice: Number(product.retailPrice) };
      const next = input.newRetailPrice ?? Number(product.retailPrice) + (input.adjustRetailPrice ?? 0);
      if (next <= 0) throw new Error("调整后价格必须大于 0");
      const updated = await prisma.product.update({
        where: { id: product.id },
        data: { retailPrice: toMoney(next) },
        select: { id: true, name: true, retailPrice: true },
      });
      await logAction({
        module: "商品",
        action: "AI 调价",
        targetType: "Product",
        targetId: product.id,
        targetName: product.name,
        before,
        after: updated,
        summary: `${product.name} 零售价 ${money(before.retailPrice)} → ${money(Number(updated.retailPrice))}`,
      });
      revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
      revalidatePath("/dashboard/products");
      revalidatePath("/shop/catalog");
      return {
        title: "商品价格已更新",
        summary: `${product.name} 零售价已调整为 ${money(Number(updated.retailPrice))}。`,
        details: details([
          ["商品", product.name],
          ["原价", money(before.retailPrice)],
          ["新价", money(Number(updated.retailPrice))],
        ]),
      };
    },
  },
  {
    name: "admin_update_product_status",
    title: "商品上下架",
    description: "管理员调整商品上架、下架或缺货状态。",
    riskLevel: "WRITE",
    access: { permission: "products:write" },
    inputSchema: z.object({ productQuery: z.string().trim().min(1), status: z.enum(["ACTIVE", "INACTIVE", "OUT_OF_STOCK"]) }),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      return {
        title: "确认调整商品状态",
        summary: `准备把 ${product.name} 状态从 ${product.status} 调整为 ${input.status}。`,
        details: details([
          ["商品", product.name],
          ["当前状态", product.status],
          ["目标状态", input.status],
        ]),
        confirmLabel: "确认调整",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const before = { id: product.id, name: product.name, status: product.status };
      const updated = await prisma.product.update({ where: { id: product.id }, data: { status: input.status as ProductStatus }, select: { id: true, name: true, status: true } });
      await logAction({
        module: "商品",
        action: "AI 更新商品状态",
        targetType: "Product",
        targetId: product.id,
        targetName: product.name,
        before,
        after: updated,
        summary: `${product.name} 状态 ${before.status} → ${updated.status}`,
      });
      revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
      revalidatePath("/dashboard/products");
      return {
        title: "商品状态已更新",
        summary: `${product.name} 已更新为 ${updated.status}。`,
        details: details([
          ["商品", product.name],
          ["状态", updated.status],
        ]),
      };
    },
  },
  {
    name: "warehouse_update_safe_stock",
    title: "调整安全库存",
    description: "仓储或管理员调整商品安全库存阈值。",
    riskLevel: "WRITE",
    access: { permission: "warehouse:manage" },
    inputSchema: z.object({ productQuery: z.string().trim().min(1), safeStock: z.coerce.number().int().min(0).max(999999) }),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      return {
        title: "确认调整安全库存",
        summary: `准备把 ${product.name} 安全库存从 ${product.safeStock} 调整为 ${input.safeStock}。`,
        details: details([
          ["商品", product.name],
          ["当前安全库存", product.safeStock],
          ["目标安全库存", input.safeStock],
        ]),
        confirmLabel: "确认调整",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const result = await updateSafeStock({ productId: product.id, safeStock: input.safeStock });
      errorFromAction(result, "安全库存更新失败");
      return {
        title: "安全库存已更新",
        summary: `${product.name} 安全库存已更新为 ${input.safeStock}。`,
        details: details([
          ["商品", product.name],
          ["安全库存", input.safeStock],
        ]),
      };
    },
  },
  {
    name: "order_status_action",
    title: "订单状态操作",
    description: "确认、发货、送达、完成或取消订单。",
    riskLevel: "WRITE",
    access: { roles: ["ADMIN", "SALESPERSON", "WAREHOUSE"] },
    resolvePermission: (input) => (["ship", "deliver", "complete"].includes(input.action) ? "orders:fulfill" : "orders:write"),
    inputSchema: z.object({
      orderNo: z.string().trim().min(1),
      action: z.enum(["confirm", "ship", "deliver", "complete", "cancel"]),
    }),
    buildConfirmation: async (input, context) => {
      const order = await findOrderByNoOrId(input.orderNo, context);
      return {
        title: input.action === "cancel" ? "确认取消订单" : "确认更新订单状态",
        summary: `准备对订单 ${order.orderNo} 执行 ${input.action}。`,
        details: details([
          ["订单号", order.orderNo],
          ["当前状态", order.status],
          ["操作", input.action],
          ["金额", money(Number(order.payableAmount))],
        ]),
        confirmLabel: input.action === "cancel" ? "确认取消" : "确认执行",
      };
    },
    handler: async (input, context) => {
      const order = await findOrderByNoOrId(input.orderNo, context);
      const result = await updateOrderStatus({ orderId: order.id, action: input.action });
      errorFromAction(result, "订单状态更新失败");
      return {
        title: "订单状态已更新",
        summary: `订单 ${order.orderNo} 已执行 ${input.action}。`,
        href: `/dashboard/orders/${order.id}`,
        details: details([
          ["订单号", order.orderNo],
          ["操作", input.action],
        ]),
      };
    },
  },
  {
    name: "inventory_stock_in",
    title: "商品入库",
    description: "仓储或管理员执行商品入库。",
    riskLevel: "WRITE",
    access: { permission: "inventory:manage" },
    inputSchema: z.object({ productQuery: z.string().trim().min(1), quantity: z.coerce.number().int().min(1), remark: z.string().max(200).optional() }),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      return {
        title: "确认入库",
        summary: `准备给 ${product.name} 入库 ${input.quantity} 件。`,
        details: details([
          ["商品", product.name],
          ["当前库存", product.stock],
          ["入库数量", input.quantity],
          ["预计库存", product.stock + input.quantity],
        ]),
        confirmLabel: "确认入库",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const result = await stockIn({ productId: product.id, quantity: input.quantity, remark: input.remark ?? "AI 助手入库" });
      errorFromAction(result, "入库失败");
      return {
        title: "入库成功",
        summary: `${product.name} 已入库 ${input.quantity} 件。`,
        details: details([
          ["商品", product.name],
          ["数量", input.quantity],
        ]),
      };
    },
  },
  {
    name: "inventory_stock_out",
    title: "商品出库",
    description: "仓储或管理员执行商品出库。",
    riskLevel: "WRITE",
    access: { permission: "inventory:manage" },
    inputSchema: z.object({ productQuery: z.string().trim().min(1), quantity: z.coerce.number().int().min(1), remark: z.string().max(200).optional() }),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      return {
        title: "确认出库",
        summary: `准备给 ${product.name} 出库 ${input.quantity} 件。`,
        details: details([
          ["商品", product.name],
          ["当前库存", product.stock],
          ["出库数量", input.quantity],
          ["预计库存", product.stock - input.quantity],
        ]),
        confirmLabel: "确认出库",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const result = await stockOut({ productId: product.id, quantity: input.quantity, remark: input.remark ?? "AI 助手出库" });
      errorFromAction(result, "出库失败");
      return {
        title: "出库成功",
        summary: `${product.name} 已出库 ${input.quantity} 件。`,
        details: details([
          ["商品", product.name],
          ["数量", input.quantity],
        ]),
      };
    },
  },
  {
    name: "warehouse_create_stock_check",
    title: "新建盘点任务",
    description: "创建仓库盘点任务草稿。",
    riskLevel: "WRITE",
    access: { permission: "warehouse:manage" },
    inputSchema: z.object({}),
    buildConfirmation: async () => ({
      title: "确认新建盘点",
      summary: "准备按当前全部 SKU 创建一张盘点任务。",
      details: [{ label: "类型", value: "全量盘点草稿" }],
      confirmLabel: "确认创建",
    }),
    handler: async () => {
      const result = await createStockCheck();
      errorFromAction(result, "盘点任务创建失败");
      return {
        title: "盘点任务已创建",
        summary: `盘点任务 ${result.data?.checkNo ?? ""} 已创建。`,
        href: result.data?.id ? `/dashboard/warehouse/checks/${result.data.id}` : "/dashboard/warehouse",
        details: details([["盘点单号", result.data?.checkNo]]),
      };
    },
  },
  {
    name: "finance_register_payment",
    title: "登记收款",
    description: "财务登记客户订单回款。",
    riskLevel: "HIGH_RISK",
    access: { permission: "finance:manage" },
    inputSchema: z.object({
      customerQuery: z.string().trim().optional().transform((value) => value || undefined),
      orderNo: z.string().trim().min(1),
      amount: z.coerce.number().positive(),
      method: z.enum(["WECHAT", "CASH", "TRANSFER"]).default("TRANSFER"),
    }),
    buildConfirmation: async (input) => {
      const { customer, order } = await resolvePaymentTarget(input);
      return {
        title: "二次确认登记收款",
        summary: `准备给 ${customer.name} 的订单 ${order.orderNo} 登记收款 ${money(input.amount)}。`,
        details: details([
          ["客户", customer.name],
          ["订单号", order.orderNo],
          ["本次收款", money(input.amount)],
          ["剩余应收", money(Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)))],
          ["收款方式", input.method],
        ]),
        confirmLabel: "确认登记",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const { customer, order } = await resolvePaymentTarget(input);
      const result = await registerPayment({ customerId: customer.id, method: input.method, allocations: [{ orderId: order.id, amount: input.amount }] });
      errorFromAction(result, "收款登记失败");
      return {
        title: "收款已登记",
        summary: `${customer.name} 的订单 ${order.orderNo} 已登记收款 ${money(input.amount)}。`,
        details: details([
          ["客户", customer.name],
          ["订单号", order.orderNo],
          ["金额", money(input.amount)],
        ]),
      };
    },
  },
  {
    name: "receipts_issue_invoice",
    title: "开具发票",
    description: "财务或票据人员确认后开具发票。",
    riskLevel: "HIGH_RISK",
    access: { permission: "receipts:manage" },
    inputSchema: z.object({
      orderNo: z.string().trim().min(1),
      type: z.enum(["NORMAL", "SPECIAL"]).default("NORMAL"),
      buyerName: z.string().trim().min(1),
      buyerTaxNo: z.string().trim().optional(),
      buyerAddress: z.string().trim().optional(),
      buyerPhone: z.string().trim().optional(),
      buyerBank: z.string().trim().optional(),
      buyerBankAccount: z.string().trim().optional(),
    }),
    buildConfirmation: async (input, context) => {
      const order = await findOrderByNoOrId(input.orderNo, context);
      return {
        title: "二次确认开票",
        summary: `准备给订单 ${order.orderNo} 开具 ${input.type === "SPECIAL" ? "专票" : "普票"}。`,
        details: details([
          ["订单号", order.orderNo],
          ["购方", input.buyerName],
          ["金额", money(Number(order.payableAmount))],
          ["发票类型", input.type],
        ]),
        confirmLabel: "确认开票",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input, context) => {
      const order = await findOrderByNoOrId(input.orderNo, context);
      const result = await issueInvoice({ ...input, orderId: order.id });
      errorFromAction(result, "开票失败");
      return {
        title: "发票已开具",
        summary: `订单 ${order.orderNo} 已开具发票 ${result.data?.invoiceNo ?? ""}。`,
        details: details([
          ["订单号", order.orderNo],
          ["发票号", result.data?.invoiceNo],
        ]),
      };
    },
  },
  {
    name: "settings_create_staff_user",
    title: "创建员工账号",
    description: "管理员创建后台员工账号。",
    riskLevel: "HIGH_RISK",
    access: { permission: "settings:manage" },
    inputSchema: z.object({
      name: z.string().trim().min(1),
      phone: z.string().trim().min(1),
      role: z.enum(["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"]),
      password: z.string().min(6).optional(),
    }),
    buildConfirmation: async (input) => ({
      title: "二次确认创建员工",
      summary: `准备创建 ${input.name}（${input.role}）后台账号。`,
      details: details([
        ["姓名", input.name],
        ["手机号", input.phone],
        ["角色", input.role],
      ]),
      confirmLabel: "确认创建",
      confirmTextRequired: "确认执行",
    }),
    handler: async (input) => {
      const result = await createStaffUser(input);
      errorFromAction(result, "创建员工失败");
      return {
        title: "员工账号已创建",
        summary: `${input.name} 的后台账号已创建。`,
        details: details([
          ["姓名", input.name],
          ["角色", input.role],
        ]),
      };
    },
  },
  {
    name: "settings_set_staff_status",
    title: "启用或禁用员工",
    description: "管理员启用或禁用后台员工账号。",
    riskLevel: "HIGH_RISK",
    access: { permission: "settings:manage" },
    inputSchema: z.object({ userQuery: z.string().trim().min(1), isActive: z.boolean() }),
    buildConfirmation: async (input) => {
      const user = await prisma.user.findFirst({ where: { OR: [{ id: input.userQuery }, { name: { contains: input.userQuery, mode: "insensitive" } }, { phone: { contains: input.userQuery } }] } });
      if (!user) throw new Error("员工不存在");
      return {
        title: input.isActive ? "二次确认启用员工" : "二次确认禁用员工",
        summary: `准备${input.isActive ? "启用" : "禁用"} ${user.name} 的后台账号。`,
        details: details([
          ["员工", user.name],
          ["角色", user.role],
          ["当前状态", user.isActive ? "启用" : "禁用"],
          ["目标状态", input.isActive ? "启用" : "禁用"],
        ]),
        confirmLabel: input.isActive ? "确认启用" : "确认禁用",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const user = await prisma.user.findFirst({ where: { OR: [{ id: input.userQuery }, { name: { contains: input.userQuery, mode: "insensitive" } }, { phone: { contains: input.userQuery } }] } });
      if (!user) throw new Error("员工不存在");
      const result = await setStaffUserStatus({ userId: user.id, isActive: input.isActive });
      errorFromAction(result, "员工状态更新失败");
      return {
        title: "员工状态已更新",
        summary: `${user.name} 已${input.isActive ? "启用" : "禁用"}。`,
        details: details([
          ["员工", user.name],
          ["状态", input.isActive ? "启用" : "禁用"],
        ]),
      };
    },
  },
  {
    name: "settings_reset_staff_password",
    title: "重置员工密码",
    description: "管理员重置后台员工密码。",
    riskLevel: "HIGH_RISK",
    access: { permission: "settings:manage" },
    inputSchema: z.object({ userQuery: z.string().trim().min(1), password: z.string().min(6) }),
    buildConfirmation: async (input) => {
      const user = await prisma.user.findFirst({ where: { OR: [{ id: input.userQuery }, { name: { contains: input.userQuery, mode: "insensitive" } }, { phone: { contains: input.userQuery } }] } });
      if (!user) throw new Error("员工不存在");
      return {
        title: "二次确认重置密码",
        summary: `准备重置 ${user.name} 的后台登录密码。`,
        details: details([
          ["员工", user.name],
          ["角色", user.role],
        ]),
        confirmLabel: "确认重置",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const user = await prisma.user.findFirst({ where: { OR: [{ id: input.userQuery }, { name: { contains: input.userQuery, mode: "insensitive" } }, { phone: { contains: input.userQuery } }] } });
      if (!user) throw new Error("员工不存在");
      const result = await resetStaffUserPassword({ userId: user.id, password: input.password });
      errorFromAction(result, "密码重置失败");
      return { title: "密码已重置", summary: `${user.name} 的密码已重置。`, details: details([["员工", user.name]]) };
    },
  },
  {
    name: "settings_save_business_config",
    title: "修改业务参数",
    description: "管理员修改大小单金额、默认安全库存、配送范围、赊账账期等业务参数。",
    riskLevel: "HIGH_RISK",
    access: { permission: "settings:manage" },
    inputSchema: z.object({ key: z.string().trim().min(1), value: z.coerce.number().min(0) }),
    buildConfirmation: async (input) => ({
      title: "二次确认修改业务参数",
      summary: `准备把业务参数 ${input.key} 调整为 ${input.value}。`,
      details: details([
        ["参数", input.key],
        ["新值", input.value],
      ]),
      confirmLabel: "确认修改",
      confirmTextRequired: "确认执行",
    }),
    handler: async (input) => {
      const result = await saveBusinessConfigs({ values: { [input.key]: input.value } });
      errorFromAction(result, "业务参数保存失败");
      return { title: "业务参数已保存", summary: `${input.key} 已更新为 ${input.value}。`, details: details([["参数", input.key], ["值", input.value]]) };
    },
  },
  {
    name: "system_launch_readiness",
    title: "上线就绪检查",
    description: "检查数据库、Auth、AI、高德、微信、小程序、支付、税控和酒类资质配置是否满足上线要求。",
    riskLevel: "READ",
    access: { permission: "settings:manage" },
    inputSchema: z.object({}),
    handler: async () => {
      const report = getLaunchReadinessReport();
      const blockers = report.items.filter((item) => item.severity === "BLOCKER");
      const warnings = report.items.filter((item) => item.severity === "WARNING");
      return {
        title: "上线就绪检查",
        summary:
          report.status === "READY"
            ? "所有上线配置检查均已通过。"
            : `正式上线口径下当前有 ${report.blockerCount} 个阻塞项、${report.warningCount} 个可延期优化项，必须先处理阻塞项。`,
        details: [
          ...details([
            ["上线口径", report.mode === "production" ? "正式公开上线" : report.mode],
            ["状态", report.status],
            ["已就绪", report.readyCount],
            ["可延期优化项", report.warningCount],
            ["阻塞项", report.blockerCount],
          ]),
          ...[...blockers, ...warnings].slice(0, 12).map((item) => ({
            label: `${item.severity === "BLOCKER" ? "阻塞" : "提醒"}｜${item.label}`,
            value: `${item.summary} 下一步：${item.action}`,
          })),
        ],
        data: report,
      };
    },
  },
  {
    name: "system_completeness_audit",
    title: "全系统完整度检查",
    description: "检查程序自身是否完整：商城、后台、经销商端、AI、权限安全、订单库存、财务营销、微信地图和运维脚本。",
    riskLevel: "READ",
    access: { permission: "settings:manage" },
    inputSchema: z.object({}),
    handler: async () => {
      const report = getSystemCompletenessReport();
      const blockers = report.items.filter((item) => item.severity === "BLOCKER");
      const warnings = report.items.filter((item) => item.severity === "WARNING");
      const todos = report.items.filter((item) => item.severity === "TODO");
      return {
        title: "全系统完整度检查",
        summary:
          report.status === "READY"
            ? "全系统完整度检查已通过。"
            : `当前有 ${report.blockerCount} 个阻塞项、${report.warningCount} 个上线风险和 ${report.todoCount} 个待完善项；阻塞项必须先处理。`,
        details: [
          ...details([
            ["状态", report.status],
            ["已就绪", report.readyCount],
            ["待完善", report.todoCount],
            ["上线风险", report.warningCount],
            ["阻塞项", report.blockerCount],
          ]),
          ...[...blockers, ...warnings, ...todos].slice(0, 12).map((item) => ({
            label: `${item.severity}｜${item.label}`,
            value: `${item.summary} 下一步：${item.action}`,
          })),
        ],
        data: report,
      };
    },
  },
  {
    name: "system_operational_acceptance",
    title: "运营验收检查",
    description: "检查上线运营是否可接手：业务签收、价格复核、库存盘点、账号权限复核、真实支付、微信、小程序、税控和备份恢复演练。",
    riskLevel: "READ",
    access: { permission: "settings:manage" },
    inputSchema: z.object({}),
    handler: async () => {
      const report = getOperationalAcceptanceReport();
      const blockers = report.items.filter((item) => item.severity === "BLOCKER");
      const warnings = report.items.filter((item) => item.severity === "WARNING");
      return {
        title: "运营验收检查",
        summary:
          report.status === "READY"
            ? "运营验收检查已通过。"
            : `当前有 ${report.blockerCount} 个验收阻塞项、${report.warningCount} 个待签收项；这些属于运营接手和真实环境验收，不是程序完整度缺陷。`,
        details: [
          ...details([
            ["状态", report.status],
            ["已签收", report.readyCount],
            ["待验收", report.warningCount],
            ["阻塞项", report.blockerCount],
          ]),
          ...[...blockers, ...warnings].slice(0, 12).map((item) => ({
            label: `${item.severity === "BLOCKER" ? "阻塞" : "待验收"}｜${item.label}`,
            value: `${item.summary} 下一步：${item.action}`,
          })),
        ],
        data: report,
      };
    },
  },
  {
    name: "admin_approve_dealer_application",
    title: "审核通过经销商",
    description: "管理员审核通过经销商申请并创建经销商档案。",
    riskLevel: "HIGH_RISK",
    access: { permission: "dealers:approve" },
    inputSchema: z.object({
      leadQuery: z.string().trim().min(1),
      shopName: z.string().trim().min(2),
      zone: z.string().trim().min(1),
      latitude: z.coerce.number().min(-90).max(90).default(27.8297),
      longitude: z.coerce.number().min(-180).max(180).default(112.9441),
      serviceRadius: z.coerce.number().int().min(500).max(50000).default(3000),
      businessLicense: z.string().trim().optional(),
      salesPersonQuery: z.string().trim().optional(),
      notes: z.string().trim().max(300).optional(),
    }),
    buildConfirmation: async (input) => {
      const [lead, salesperson] = await Promise.all([findDealerApplicationLead(input.leadQuery!), findSalespersonByQuery(input.salesPersonQuery)]);
      return {
        title: "二次确认通过经销商申请",
        summary: `准备通过 ${lead.name ?? lead.customer?.name ?? input.shopName} 的经销商申请，并创建门店 ${input.shopName}。`,
        details: details([
          ["申请人", `${lead.name ?? lead.customer?.name ?? "-"} ${lead.phone ?? lead.customer?.phone ?? ""}`],
          ["门店", input.shopName],
          ["区域", input.zone],
          ["服务半径", `${input.serviceRadius ?? 3000} 米`],
          ["归属销售员", salesperson?.name ?? "保持原分配"],
        ]),
        confirmLabel: "确认通过",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const [lead, salesperson] = await Promise.all([findDealerApplicationLead(input.leadQuery!), findSalespersonByQuery(input.salesPersonQuery)]);
      const result = await approveDealerApplication({
        leadId: lead.id,
        shopName: input.shopName ?? lead.name ?? "经销商门店",
        zone: input.zone ?? "未分区",
        latitude: input.latitude ?? 27.8297,
        longitude: input.longitude ?? 112.9441,
        serviceRadius: input.serviceRadius ?? 3000,
        businessLicense: input.businessLicense,
        salesPersonId: salesperson?.id,
        notes: input.notes,
      });
      errorFromAction(result, "经销商审核失败");
      return {
        title: "经销商申请已通过",
        summary: `${input.shopName} 已开通经销商档案。`,
        href: "/dashboard/dealers",
        details: details([
          ["门店", input.shopName],
          ["区域", input.zone],
          ["归属销售员", salesperson?.name ?? "保持原分配"],
        ]),
      };
    },
  },
  {
    name: "admin_reject_dealer_application",
    title: "驳回经销商申请",
    description: "管理员驳回经销商申请并记录原因。",
    riskLevel: "HIGH_RISK",
    access: { permission: "dealers:approve" },
    inputSchema: z.object({ leadQuery: z.string().trim().min(1), reason: z.string().trim().min(2).max(300) }),
    buildConfirmation: async (input) => {
      const lead = await findDealerApplicationLead(input.leadQuery!);
      return {
        title: "二次确认驳回经销商申请",
        summary: `准备驳回 ${lead.name ?? lead.customer?.name ?? "该客户"} 的经销商申请。`,
        details: details([
          ["申请人", `${lead.name ?? lead.customer?.name ?? "-"} ${lead.phone ?? lead.customer?.phone ?? ""}`],
          ["原因", input.reason],
        ]),
        confirmLabel: "确认驳回",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const lead = await findDealerApplicationLead(input.leadQuery!);
      const result = await rejectDealerApplication({ leadId: lead.id, reason: input.reason });
      errorFromAction(result, "经销商申请驳回失败");
      return {
        title: "经销商申请已驳回",
        summary: `已驳回申请：${input.reason}`,
        href: "/dashboard/dealers",
        details: details([
          ["申请人", lead.name ?? lead.customer?.name],
          ["原因", input.reason],
        ]),
      };
    },
  },
  {
    name: "admin_update_dealer_policy",
    title: "修改经销商政策",
    description: "管理员或销售员修改经销商接单金额、价格等级、跨区、拒单和品牌政策。",
    riskLevel: "WRITE",
    access: { permission: "channel:manage" },
    inputSchema: z.object({
      dealerQuery: z.string().trim().min(1),
      minOrderAmount: z.coerce.number().min(0).optional(),
      maxOrderAmount: z.coerce.number().min(0).optional(),
      priceLevel: z.enum(["RETAIL", "WHOLESALE", "VIP"]).optional(),
      allowCrossZone: z.boolean().optional(),
      allowReject: z.boolean().optional(),
      rejectLimitPerDay: z.coerce.number().int().min(0).max(99).optional(),
      priority: z.coerce.number().int().min(0).max(999).optional(),
      brandQueries: z.array(z.string().trim().min(1)).default([]),
      notes: z.string().trim().max(500).optional(),
    }),
    buildConfirmation: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const brands = await resolveBrandIds(input.brandQueries);
      return {
        title: "确认修改经销商政策",
        summary: `准备修改 ${dealer.shopName} 的分单与价格政策。`,
        details: details([
          ["经销商", dealer.shopName],
          ["最低订单", money(Number(input.minOrderAmount ?? dealer.policy?.minOrderAmount ?? 0))],
          ["最高订单", input.maxOrderAmount === undefined ? "不限制/保持原值" : money(Number(input.maxOrderAmount))],
          ["价格等级", input.priceLevel ?? dealer.policy?.priceLevel ?? "RETAIL"],
          ["跨区接单", String(input.allowCrossZone ?? dealer.policy?.allowCrossZone ?? false)],
          ["允许拒单", String(input.allowReject ?? dealer.policy?.allowReject ?? true)],
          ["品牌", brands.length ? brands.map((brand) => brand.name).join("、") : "不限制/保持原值"],
        ]),
        confirmLabel: "确认保存",
      };
    },
    handler: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const brands = await resolveBrandIds(input.brandQueries);
      const result = await updateDealerPolicy({
        dealerId: dealer.id,
        minOrderAmount: input.minOrderAmount ?? Number(dealer.policy?.minOrderAmount ?? 0),
        maxOrderAmount: (input.maxOrderAmount ?? Number(dealer.policy?.maxOrderAmount ?? 0)) || undefined,
        priceLevel: input.priceLevel ?? dealer.policy?.priceLevel ?? "RETAIL",
        allowCrossZone: input.allowCrossZone ?? dealer.policy?.allowCrossZone ?? false,
        allowReject: input.allowReject ?? dealer.policy?.allowReject ?? true,
        rejectLimitPerDay: input.rejectLimitPerDay ?? dealer.policy?.rejectLimitPerDay ?? 5,
        priority: input.priority ?? dealer.policy?.priority ?? 0,
        brandIds: brands.length ? brands.map((brand) => brand.id) : ((dealer.policy?.brandIds as string[] | null) ?? []),
        notes: input.notes ?? dealer.policy?.notes ?? undefined,
      });
      errorFromAction(result, "经销商政策保存失败");
      return {
        title: "经销商政策已保存",
        summary: `${dealer.shopName} 的经销商政策已更新。`,
        href: `/dashboard/dealers/${dealer.id}/policy`,
        details: details([
          ["经销商", dealer.shopName],
          ["价格等级", input.priceLevel ?? dealer.policy?.priceLevel ?? "RETAIL"],
          ["优先级", input.priority ?? dealer.policy?.priority ?? 0],
        ]),
      };
    },
  },
  {
    name: "admin_set_dealer_accepting",
    title: "启停经销商接单",
    description: "管理员启用或暂停经销商接单。",
    riskLevel: "WRITE",
    access: { permission: "dealers:approve" },
    inputSchema: z.object({ dealerQuery: z.string().trim().min(1), isActive: z.boolean() }),
    buildConfirmation: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      return {
        title: input.isActive ? "确认启用接单" : "确认暂停接单",
        summary: `准备${input.isActive ? "启用" : "暂停"} ${dealer.shopName} 接单。`,
        details: details([
          ["经销商", dealer.shopName],
          ["当前状态", dealer.isAccepting ? "接单中" : "已暂停"],
          ["目标状态", input.isActive ? "接单中" : "已暂停"],
        ]),
        confirmLabel: input.isActive ? "确认启用" : "确认暂停",
      };
    },
    handler: async (input, context) => {
      const dealer = await findDealerByQuery(input.dealerQuery!, context);
      const updated = await prisma.dealer.update({
        where: { id: dealer.id },
        data: { isAccepting: input.isActive },
        select: { id: true, shopName: true, isAccepting: true },
      });
      await logAction({
        module: "经销商",
        action: input.isActive ? "AI 启用经销商接单" : "AI 暂停经销商接单",
        targetType: "Dealer",
        targetId: dealer.id,
        targetName: dealer.shopName,
        before: { isAccepting: dealer.isAccepting },
        after: { isAccepting: updated.isAccepting },
        summary: `${dealer.shopName} 已${updated.isAccepting ? "启用" : "暂停"}接单`,
      });
      revalidatePath("/dashboard/dealers");
      return {
        title: "接单状态已更新",
        summary: `${updated.shopName} 已${updated.isAccepting ? "启用" : "暂停"}接单。`,
        href: "/dashboard/dealers",
        details: details([
          ["经销商", updated.shopName],
          ["状态", updated.isAccepting ? "接单中" : "已暂停"],
        ]),
      };
    },
  },
  {
    name: "admin_dealer_conflicts",
    title: "经销商拒单与冲突",
    description: "查询经销商拒单、投诉、跨区、库存和低价等渠道冲突。",
    riskLevel: "READ",
    access: { permission: "channel:manage" },
    inputSchema: z.object({ dealerQuery: z.string().trim().optional(), limit: z.coerce.number().int().min(1).max(20).default(8) }),
    handler: async (input, context) => {
      const dealer = input.dealerQuery ? await findDealerByQuery(input.dealerQuery!, context) : null;
      const conflicts = await prisma.channelConflict.findMany({
        where: {
          ...(dealer ? { dealerId: dealer.id } : {}),
          ...(context.role === "SALESPERSON" ? { ownerId: context.user.id } : {}),
        },
        include: { dealer: { select: { shopName: true } } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return {
        title: "经销商拒单与冲突",
        summary: conflicts.length ? `找到 ${conflicts.length} 条冲突记录。` : "当前没有匹配冲突记录。",
        details: conflicts.map((conflict) => ({
          label: conflict.summary,
          value: `${conflict.type}｜${conflict.status}｜${conflict.dealer?.shopName ?? "未关联经销商"}｜订单 ${conflict.orderId ?? "无"}`,
        })),
      };
    },
  },
  {
    name: "marketing_create_coupon",
    title: "创建优惠券",
    description: "营销人员确认后创建满减或折扣优惠券。",
    riskLevel: "WRITE",
    access: { permission: "marketing:manage" },
    inputSchema: z.object({
      name: z.string().trim().min(2),
      couponType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
      amount: z.coerce.number().positive().optional(),
      percent: z.coerce.number().positive().max(9.9).optional(),
      threshold: z.coerce.number().min(0).default(0),
      totalQuantity: z.coerce.number().int().min(1).default(100),
      startsAt: z.string().trim().optional(),
      endsAt: z.string().trim().optional(),
    }),
    buildConfirmation: async (input) => ({
      title: "确认创建优惠券",
      summary: `准备创建优惠券 ${input.name}。`,
      details: details([
        ["名称", input.name],
        ["类型", input.couponType],
        ["面额/折扣", input.couponType === "AMOUNT" ? money(Number(input.amount ?? 0)) : `${input.percent ?? 0} 折`],
        ["门槛", money(Number(input.threshold ?? 0))],
        ["数量", input.totalQuantity ?? 100],
        ["有效期", `${input.startsAt ?? couponDate(0)} 至 ${input.endsAt ?? couponDate(30)}`],
      ]),
      confirmLabel: "确认创建",
    }),
    handler: async (input) => {
      const result = await createCoupon({
        name: input.name,
        type: input.couponType ?? "AMOUNT",
        amount: input.amount,
        percent: input.percent,
        threshold: input.threshold ?? 0,
        totalQuantity: input.totalQuantity ?? 100,
        startsAt: input.startsAt ?? couponDate(0),
        endsAt: input.endsAt ?? couponDate(30),
      });
      errorFromAction(result, "优惠券创建失败");
      return {
        title: "优惠券已创建",
        summary: `${input.name} 已创建。`,
        href: "/dashboard/marketing/coupons",
        details: details([
          ["名称", input.name],
          ["数量", input.totalQuantity ?? 100],
        ]),
      };
    },
  },
  {
    name: "marketing_issue_coupon",
    title: "确认发放优惠券",
    description: "按客户标签批量发放优惠券。",
    riskLevel: "HIGH_RISK",
    access: { permission: "marketing:manage" },
    inputSchema: z.object({ couponQuery: z.string().trim().min(1), tag: z.string().trim().min(1) }),
    buildConfirmation: async (input) => {
      const coupon = await findCouponByQuery(input.couponQuery!);
      const targetCount = await prisma.customer.count({
        where: {
          tags: { some: { name: input.tag! } },
          coupons: { none: { couponId: coupon.id } },
        },
      });
      return {
        title: "二次确认发放优惠券",
        summary: `准备给标签为「${input.tag}」的客户发放 ${coupon.name}。`,
        details: details([
          ["优惠券", coupon.name],
          ["目标标签", input.tag],
          ["可发客户", targetCount],
          ["剩余券量", coupon.totalQuantity - coupon.issuedQuantity],
        ]),
        confirmLabel: "确认发放",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const coupon = await findCouponByQuery(input.couponQuery!);
      const result = await issueCouponByTag(coupon.id, input.tag!);
      errorFromAction(result, "优惠券发放失败");
      return {
        title: "优惠券已发放",
        summary: `${coupon.name} 已发放 ${result.data?.count ?? 0} 张。`,
        href: "/dashboard/marketing/coupons",
        details: details([
          ["优惠券", coupon.name],
          ["标签", input.tag],
          ["数量", result.data?.count ?? 0],
        ]),
      };
    },
  },
  {
    name: "marketing_create_product_push",
    title: "确认新品推送",
    description: "选择新品和目标画像后生成并发送新品推送记录。",
    riskLevel: "HIGH_RISK",
    access: { permission: "marketing:manage" },
    inputSchema: z.object({ productQuery: z.string().trim().min(1), targetTag: z.string().trim().min(1), message: z.string().trim().max(500).optional() }),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      return {
        title: "二次确认新品推送",
        summary: `准备向「${input.targetTag}」人群推送 ${product.name}。`,
        details: details([
          ["商品", product.name],
          ["目标画像", input.targetTag],
          ["话术", input.message || "使用系统自动话术"],
        ]),
        confirmLabel: "确认推送",
        confirmTextRequired: "确认执行",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const result = await createProductPush({ productId: product.id, targetTag: input.targetTag!, message: input.message });
      errorFromAction(result, "新品推送失败");
      return {
        title: "新品推送已生成",
        summary: `${product.name} 已生成 ${result.data?.count ?? 0} 条推送。`,
        href: "/dashboard/product-pushes",
        details: details([
          ["商品", product.name],
          ["目标画像", input.targetTag],
          ["数量", result.data?.count ?? 0],
        ]),
      };
    },
  },
  {
    name: "dealer_incoming_orders",
    title: "经销商待接订单",
    description: "经销商查询自己的待接订单。",
    riskLevel: "READ",
    access: { roles: ["DEALER"] },
    inputSchema: z.object({}),
    handler: async (_, context) => {
      const dealer = await prisma.dealer.findUnique({ where: { customerId: context.user.id } });
      if (!dealer) throw new Error("经销商档案不存在");
      const routings = await prisma.orderRouting.findMany({
        where: { dealerId: dealer.id, status: "PENDING" },
        include: { order: { include: { customer: { select: { name: true } }, items: true } } },
        orderBy: { assignedAt: "asc" },
        take: 8,
      });
      return {
        title: "待接订单",
        summary: routings.length ? `当前有 ${routings.length} 个待接订单。` : "当前没有待接订单。",
        details: routings.map((routing) => ({
          label: routing.order.orderNo,
          value: `${routing.order.customer.name}｜${money(Number(routing.order.payableAmount))}｜${routing.order.items.reduce((sum, item) => sum + item.quantity, 0)} 件`,
        })),
      };
    },
  },
  {
    name: "dealer_report_stock",
    title: "经销商上报库存",
    description: "经销商上报自己的门店库存。",
    riskLevel: "WRITE",
    access: { roles: ["DEALER"] },
    inputSchema: z.object({ productQuery: z.string().trim().min(1), stock: z.coerce.number().int().min(0).max(99999) }),
    buildConfirmation: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      return {
        title: "确认上报库存",
        summary: `准备上报 ${product.name} 门店库存 ${input.stock} 件。`,
        details: details([
          ["商品", product.name],
          ["库存", input.stock],
        ]),
        confirmLabel: "确认上报",
      };
    },
    handler: async (input) => {
      const product = await findProductByQuery(input.productQuery!);
      const result = await reportDealerStock({ productId: product.id, stock: input.stock });
      errorFromAction(result, "库存上报失败");
      return { title: "库存已上报", summary: `${product.name} 门店库存已上报为 ${input.stock}。`, details: details([["商品", product.name], ["库存", input.stock]]) };
    },
  },
  {
    name: "dealer_settlement_summary",
    title: "经销商结算摘要",
    description: "经销商查询自己的结算金额和完成订单。",
    riskLevel: "READ",
    access: { roles: ["DEALER"] },
    inputSchema: z.object({}),
    handler: async (_, context) => {
      const dealer = await prisma.dealer.findUnique({ where: { customerId: context.user.id } });
      if (!dealer) throw new Error("经销商档案不存在");
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const routings = await prisma.orderRouting.findMany({
        where: { dealerId: dealer.id, status: "ACCEPTED", order: { status: "COMPLETED", updatedAt: { gte: start } } },
        include: { order: true },
        take: 20,
      });
      const amount = routings.reduce((sum, routing) => sum + Number(routing.order.payableAmount), 0);
      return {
        title: "本月结算摘要",
        summary: `本月完成 ${routings.length} 单，预估结算 ${money(amount * 0.9)}。`,
        details: details([
          ["完成订单", routings.length],
          ["订单金额", money(amount)],
          ["预估结算", money(amount * 0.9)],
        ]),
      };
    },
  },
  {
    name: "dealer_accept_routing",
    title: "经销商接单",
    description: "经销商确认接受待接订单。",
    riskLevel: "WRITE",
    access: { roles: ["DEALER"] },
    inputSchema: z.object({ routingId: z.string().trim().min(1) }),
    buildConfirmation: async (input, context) => {
      const routing = await findDealerRoutingByInput(input.routingId, context.user.id);
      return {
        title: "确认接单",
        summary: `准备接受订单 ${routing.order.orderNo}。`,
        details: details([
          ["订单号", routing.order.orderNo],
          ["金额", money(Number(routing.order.payableAmount))],
        ]),
        confirmLabel: "确认接单",
      };
    },
    handler: async (input, context) => {
      const routing = await findDealerRoutingByInput(input.routingId, context.user.id);
      const result = await acceptRouting(routing.id);
      errorFromAction(result, "接单失败");
      return { title: "已接单", summary: "订单已接受，请及时处理配送。", details: [] };
    },
  },
  {
    name: "dealer_reject_routing",
    title: "经销商拒单",
    description: "经销商拒绝待接订单并触发重匹配。",
    riskLevel: "WRITE",
    access: { roles: ["DEALER"] },
    inputSchema: z.object({ routingId: z.string().trim().min(1), reason: z.string().trim().min(1).max(200) }),
    buildConfirmation: async (input, context) => {
      const routing = await findDealerRoutingByInput(input.routingId, context.user.id);
      return {
        title: "确认拒单",
        summary: `准备拒绝订单 ${routing.order.orderNo}，原因：${input.reason}。系统会自动重匹配并记录渠道冲突。`,
        details: details([
          ["订单号", routing.order.orderNo],
          ["原因", input.reason],
        ]),
        confirmLabel: "确认拒单",
      };
    },
    handler: async (input, context) => {
      const routing = await findDealerRoutingByInput(input.routingId, context.user.id);
      const result = await rejectRouting(routing.id, input.reason);
      errorFromAction(result, "拒单失败");
      return { title: "已拒单", summary: "订单已拒绝并自动重匹配。", details: details([["原因", input.reason]]) };
    },
  },
  {
    name: "admin_create_product_draft",
    title: "新增商品草稿",
    description: "根据老板口述生成新增商品草稿，不直接写库。",
    riskLevel: "DRAFT",
    access: { permission: "products:write" },
    inputSchema: z.object({ text: z.string().trim().min(1) }),
    handler: async (input) => ({
      title: "新增商品草稿",
      summary: "已整理成商品草稿，请补齐 SKU、分类、品牌、成本价、批发价、零售价、库存和安全库存后再创建。",
      details: details([
        ["原始描述", input.text],
        ["建议下一步", "进入商品新增页补齐字段"],
      ]),
      href: "/dashboard/products/new",
    }),
  },
  {
    name: "orders_manual_order_draft",
    title: "后台开单草稿",
    description: "根据口述生成后台开单草稿，不直接创建订单。",
    riskLevel: "DRAFT",
    access: { permission: "orders:write" },
    inputSchema: z.object({ text: z.string().trim().min(1) }),
    handler: async (input) => ({
      title: "后台开单草稿",
      summary: "已整理开单意图，请在后台开单页确认客户、地址、商品明细和支付方式。",
      details: details([["原始描述", input.text]]),
      href: "/dashboard/orders/new",
    }),
  },
  {
    name: "marketing_coupon_draft",
    title: "优惠券草稿",
    description: "创建优惠券活动草稿，不直接发券。",
    riskLevel: "DRAFT",
    access: { permission: "marketing:manage" },
    inputSchema: z.object({ text: z.string().trim().min(1) }),
    handler: async (input) => ({
      title: "优惠券草稿",
      summary: "已整理优惠券活动意图，请到营销后台设置面额、门槛、有效期和发放对象。",
      details: details([["原始描述", input.text]]),
      href: "/dashboard/marketing/coupons/new",
    }),
  },
  {
    name: "marketing_product_push_draft",
    title: "新品推送草稿",
    description: "生成新品推送草稿，不直接触达客户。",
    riskLevel: "DRAFT",
    access: { permission: "marketing:manage" },
    inputSchema: z.object({ text: z.string().trim().min(1) }),
    handler: async (input) => ({
      title: "新品推送草稿",
      summary: "已整理新品推送意图，请到新品推送页选择商品、人群和话术后确认发送。",
      details: details([["原始描述", input.text]]),
      href: "/dashboard/product-pushes",
    }),
  },
];

type AiToolSemanticMetadata = Pick<AiToolDefinition, "capabilities" | "examples" | "argumentHints">;

const aiToolSemanticMetadata: Record<string, AiToolSemanticMetadata> = {
  navigate_to_feature: {
    capabilities: ["功能入口", "打开页面", "进入页面", "在哪管理", "菜单位置", "全站导航", "页面跳转"],
    examples: ["供应商管理在哪", "怎么查看库存流水", "帮我打开经销商政策", "微信菜单在哪配置"],
    argumentHints: '{"query":"用户原话或功能名","capabilityId":"可选，能力目录 id"}',
  },
  feature_help: {
    capabilities: ["功能说明", "页面帮助", "能做什么", "权限说明", "怎么使用"],
    examples: ["供应商管理能做什么", "微信菜单谁能配置", "经销商政策有什么用"],
    argumentHints: '{"query":"用户原话或功能名","capabilityId":"可选，能力目录 id"}',
  },
  purchase_supplier_summary: {
    capabilities: ["采购摘要", "采购单", "供应商", "供应商管理", "采购金额", "到货", "进货"],
    examples: ["采购和供应商情况怎么样", "供应商管理现在有多少家", "这个月采购单有哪些"],
    argumentHints: '{"query":"供应商/联系人/手机号，可为空","period":"month","limit":8}',
  },
  product_catalog_summary: {
    capabilities: ["产品分类", "品牌管理", "商品素材", "图片素材", "素材审核", "授权状态", "分类品牌"],
    examples: ["商品素材审核还有多少", "产品分类品牌情况", "图片素材有哪些待授权"],
    argumentHints: '{"query":"商品/SKU/品牌/素材来源，可为空","period":"month","limit":8}',
  },
  inventory_records_summary: {
    capabilities: ["库存流水", "出入库记录", "库存记录", "谁操作了库存", "库存变动"],
    examples: ["怎么查看库存流水", "这个月有哪些入库出库记录", "青岛啤酒库存流水"],
    argumentHints: '{"query":"商品/SKU/操作人/备注，可为空","period":"month","limit":8}',
  },
  shop_account_summary: {
    capabilities: ["账户中心", "我的账户", "收货地址", "我的资料", "我的积分", "我的欠款"],
    examples: ["我的账户情况", "我的收货地址和优惠券", "我还有多少欠款"],
    argumentHints: "{}",
  },
  shop_cart_summary: {
    capabilities: ["购物车", "我的购物车", "购物车商品", "结算商品"],
    examples: ["查购物车", "我的购物车里有什么", "购物车多少钱"],
    argumentHints: '{"limit":10}',
  },
  shop_coupon_summary: {
    capabilities: ["我的优惠券", "可用券", "优惠券状态", "券包"],
    examples: ["我的优惠券有哪些", "有没有可用券", "优惠券快过期了吗"],
    argumentHints: '{"limit":10}',
  },
  admin_customer_account_summary: {
    capabilities: ["代查客户账户", "客户账户", "客户资料", "客户地址", "客户积分", "客户欠款", "客户概况"],
    examples: ["帮我看张阿姨账户情况", "查一下 13900139001 的地址和欠款", "这个客户资料怎么样"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","limit":8}',
  },
  admin_customer_cart_summary: {
    capabilities: ["代查客户购物车", "客户购物车", "购物车商品", "客户结算商品"],
    examples: ["张阿姨购物车里有什么", "帮我看 13900139001 购物车多少钱"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","limit":8}',
  },
  admin_customer_coupon_summary: {
    capabilities: ["代查客户优惠券", "客户优惠券", "客户可用券", "客户券包"],
    examples: ["张阿姨有哪些优惠券", "13900139001 有没有可用券"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","limit":8}',
  },
  admin_customer_orders: {
    capabilities: ["代查客户订单", "客户订单", "客户配送状态", "客户购买订单", "客户下单记录"],
    examples: ["张阿姨最近有哪些订单", "查 13900139001 的订单状态"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","limit":8}',
  },
  admin_customer_receivables: {
    capabilities: ["代查客户待付款", "客户欠款", "客户应收", "客户账款", "客户未付款订单"],
    examples: ["张阿姨还有多少欠款", "查 13900139001 哪些订单没付"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","limit":20}',
  },
  admin_customer_order_draft: {
    capabilities: ["代客户开单草稿", "帮客户下单草稿", "客户要货草稿", "后台开单草稿"],
    examples: ["帮张阿姨开单 2 件青岛啤酒", "给 13900139001 下单 1 箱可乐"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","productQuery":"商品名/SKU","quantity":1,"payMethod":"WECHAT"}',
  },
  wechat_ecosystem_summary: {
    capabilities: ["微信生态", "公众号菜单", "模板消息", "小程序分享", "微信配置", "微信消息日志"],
    examples: ["微信生态现在怎么样", "微信菜单在哪配置", "模板消息发送情况"],
    argumentHints: '{"period":"month","limit":8}',
  },
  audit_log_summary: {
    capabilities: ["操作日志", "审计日志", "AI 日志", "谁操作了", "日志查询"],
    examples: ["最近 AI 工具日志", "谁改了库存", "操作日志里有哪些异常"],
    argumentHints: '{"query":"模块/动作/操作人/关键词，可为空","period":"month","limit":8}',
  },
  finance_statement_summary: {
    capabilities: ["财务对账", "对账单", "票据", "发票", "收款记录", "客户欠款", "财务报表细项"],
    examples: ["财务对账单情况", "这个月票据和收款怎么样", "客户欠款排行"],
    argumentHints: '{"period":"month","limit":8}',
  },
  channel_pipeline_summary: {
    capabilities: ["渠道漏斗", "线索", "询价", "报价", "推广码", "新品推送", "渠道冲突"],
    examples: ["渠道线索询价报价情况", "最近线索转化怎么样", "推广码和渠道冲突怎么样"],
    argumentHints: '{"query":"线索姓名/手机号/备注，可为空","period":"month","limit":8}',
  },
  dealer_promotion_summary: {
    capabilities: ["经销商推广", "我的推广码", "经销商线索", "门店线索", "扫码客户", "经销商转化"],
    examples: ["我的推广效果怎么样", "我的推广码有多少线索", "经销商线索情况"],
    argumentHints: '{"period":"month","limit":8}',
  },
  admin_dealer_promotion_summary: {
    capabilities: ["代查经销商推广", "经销商推广效果", "门店推广码", "经销商线索转化", "门店扫码线索"],
    examples: ["莲城便利店推广效果怎么样", "查某经销商推广码和线索"],
    argumentHints: '{"dealerQuery":"经销商门店/联系人/手机号","period":"month","limit":8}',
  },
  admin_dealer_incoming_orders: {
    capabilities: ["代查经销商待接订单", "经销商待接单", "门店待接订单", "经销商新订单"],
    examples: ["莲城便利店有哪些待接订单", "查某经销商待接单"],
    argumentHints: '{"dealerQuery":"经销商门店/联系人/手机号","limit":8}',
  },
  admin_dealer_settlement_summary: {
    capabilities: ["代查经销商结算", "经销商结算", "经销商佣金", "门店账款", "门店结算"],
    examples: ["莲城便利店本月结算多少", "查某经销商佣金"],
    argumentHints: '{"dealerQuery":"经销商门店/联系人/手机号","limit":8}',
  },
  admin_dealer_stock_summary: {
    capabilities: ["代查经销商库存", "经销商库存", "门店库存", "门店上报库存"],
    examples: ["莲城便利店门店库存怎么样", "查某经销商库存"],
    argumentHints: '{"dealerQuery":"经销商门店/联系人/手机号","limit":8}',
  },
  search_products: {
    capabilities: ["商品搜索", "查商品", "查价格", "查库存", "SKU 查询", "品牌规格查询"],
    examples: ["查一下青岛经典啤酒", "HQ-BEER-001 多少钱", "有没有 500ml 啤酒"],
    argumentHints: '{"query":"商品名/SKU/品牌/规格","limit":5}',
  },
  customer_context: {
    capabilities: ["当前客户信息", "默认地址", "历史购买", "常用支付方式"],
    examples: ["我的收货信息是什么", "我常买什么"],
    argumentHints: "{}",
  },
  customer_submit_order: {
    capabilities: ["客户下单", "购买商品", "要货", "补货", "生成订单确认卡"],
    examples: ["我要下单 1 箱青岛经典啤酒", "来 2 件 HQ-BEER-001，微信支付"],
    argumentHints: '{"productQuery":"商品名/SKU","quantity":1,"payMethod":"WECHAT"}',
  },
  customer_orders: {
    capabilities: ["我的订单", "订单状态", "配送状态", "购买记录"],
    examples: ["我的订单到哪了", "最近买了什么"],
    argumentHints: '{"limit":5}',
  },
  customer_receivables: {
    capabilities: ["我的欠款", "我的应收", "待付款", "账款"],
    examples: ["我还有多少欠款", "哪些订单没付"],
    argumentHints: "{}",
  },
  business_overview: {
    capabilities: ["经营总览", "销售额", "订单数", "经营客户数", "回款", "毛利", "库存预警", "待处理事项"],
    examples: ["这个月经营怎么样", "今天销售额和订单数", "现在有哪些待处理事项"],
    argumentHints: '{"period":"month"}',
  },
  order_summary: {
    capabilities: ["订单摘要", "最近订单", "订单列表", "订单状态", "待支付订单", "订单金额", "有哪些订单", "多少订单", "下单记录"],
    examples: ["最近有哪些订单", "今天订单情况怎么样", "待支付订单有哪些"],
    argumentHints: '{"query":"订单号/客户名/手机号/商品名，可为空","period":"month","status":"","limit":8}',
  },
  salesperson_performance: {
    capabilities: ["销售员业绩", "业务员绩效", "销售员数量", "有几个销售员", "哪个销售员最好", "销售转化", "报价转化", "成交", "销售排名", "客户数", "回款"],
    examples: ["这个月哪个人的业绩最好", "有几个销售员", "李明最近转化怎么样", "这个月李明业绩怎么样", "销售员排名如何"],
    argumentHints: '{"salespersonName":"销售员姓名或手机号；查询数量/排行/最好时留空","period":"month"}',
  },
  search_customers: {
    capabilities: ["客户查询", "查客户", "客户欠款", "归属销售员", "最近订单", "客户标签"],
    examples: ["查一下张阿姨", "谁是李明名下客户", "欠款客户有哪些"],
    argumentHints: '{"query":"客户姓名/手机号/标签/归属销售员","limit":8}',
  },
  customer_analytics_summary: {
    capabilities: ["客户统计", "用户统计", "会员统计", "客户总数", "用户总数", "会员数量", "一共有多少客户", "多少客户", "多少用户", "我有多少用户", "消费最高客户", "消费最多客户", "客户消费排行", "客户类型分布"],
    examples: ["现在一共有多少客户，哪个消费最高", "现在一共有多少用户", "我有多少用户", "哪个客户消费最多"],
    argumentHints: '{"period":"all","limit":5}',
  },
  customer_purchase_history: {
    capabilities: ["客户购买历史", "买过什么", "最近购买", "消费记录", "采购记录"],
    examples: ["张阿姨买了什么东西", "leige 最近买过哪些商品"],
    argumentHints: '{"customerQuery":"客户姓名/手机号","limit":8}',
  },
  admin_create_customer: {
    capabilities: ["新增客户", "创建客户", "录入客户", "客户建档"],
    examples: ["新增客户张三 13900000000", "录入经销商客户"],
    argumentHints: '{"name":"客户名","phone":"13900000000","customerType":"CONSUMER","creditLimit":0,"salesPersonQuery":"销售员手机号","tags":["标签"]}',
  },
  admin_update_customer_profile: {
    capabilities: ["修改客户资料", "改客户姓名", "改客户手机号", "改信用额度"],
    examples: ["把客户 13900000000 信用额度改成 1000"],
    argumentHints: '{"customerQuery":"客户手机号/姓名","name":"新姓名","creditLimit":1000}',
  },
  admin_assign_customer_salesperson: {
    capabilities: ["调整客户归属", "分配销售员", "客户转给业务员"],
    examples: ["把张阿姨分给李明"],
    argumentHints: '{"customerQuery":"客户手机号/姓名","salesPersonQuery":"销售员手机号/姓名"}',
  },
  admin_update_customer_tags: {
    capabilities: ["客户标签", "追加标签", "移除标签", "替换标签"],
    examples: ["给张阿姨加高价值标签"],
    argumentHints: '{"customerQuery":"客户手机号/姓名","tags":["标签"],"mode":"add"}',
  },
  product_operations_summary: {
    capabilities: ["商品经营", "库存总览", "库存排行", "库存最多", "低库存", "缺货", "销量排行", "滞销", "毛利", "商品价格"],
    examples: ["现在库存有多少商品，哪个库存最多", "哪些商品快没货了", "销量最高的商品有哪些"],
    argumentHints: '{"query":"商品名/SKU/品牌，可为空","limit":8,"sort":"stock_desc"}',
  },
  finance_summary: {
    capabilities: ["财务摘要", "应收款", "欠款", "欠款最多", "账龄", "回款趋势", "客户对账", "收款"],
    examples: ["谁欠款最多", "这个月回款怎么样", "应收账龄情况"],
    argumentHints: '{"period":"month"}',
  },
  delivery_summary: {
    capabilities: ["配送查询", "配送订单", "客户配送订单", "哪些客户有配送单", "待发货", "配送中", "已送达", "异常订单", "物流", "配送客户", "配送列表"],
    examples: ["有哪些客户有配送订单", "现在有哪些待发货订单", "配送中有哪些客户", "配送异常有哪些"],
    argumentHints: "{}",
  },
  channel_summary: {
    capabilities: ["渠道摘要", "经销商表现", "线索", "询价", "报价", "渠道冲突", "新品推送效果"],
    examples: ["经销商线索怎么样", "最近渠道冲突有哪些"],
    argumentHints: "{}",
  },
  admin_update_product_price: {
    capabilities: ["商品调价", "涨价", "降价", "修改零售价", "改售价"],
    examples: ["把 HQ-BEER-001 涨价 5 块", "把青岛经典啤酒价格改成 16"],
    argumentHints: '{"productQuery":"商品名/SKU","newRetailPrice":19,"adjustRetailPrice":5}',
  },
  admin_update_product_status: {
    capabilities: ["商品上下架", "上架", "下架", "售罄", "缺货状态"],
    examples: ["把 HQ-BEER-001 下架", "青岛经典啤酒设为缺货"],
    argumentHints: '{"productQuery":"商品名/SKU","status":"INACTIVE"}',
  },
  warehouse_update_safe_stock: {
    capabilities: ["安全库存", "预警阈值", "库存预警"],
    examples: ["把 HQ-BEER-001 安全库存设为 20"],
    argumentHints: '{"productQuery":"商品名/SKU","safeStock":17}',
  },
  order_status_action: {
    capabilities: ["订单状态", "确认订单", "发货", "送达", "完成订单", "取消订单"],
    examples: ["订单 HQ20260430000007 发货", "取消订单 HQ20260430000007"],
    argumentHints: '{"orderNo":"HQ...","action":"ship"}',
  },
  inventory_stock_in: {
    capabilities: ["商品入库", "库存入库", "补库存", "加库存"],
    examples: ["给 HQ-BEER-001 入库 2 件"],
    argumentHints: '{"productQuery":"商品名/SKU","quantity":2,"remark":"备注"}',
  },
  inventory_stock_out: {
    capabilities: ["商品出库", "库存出库", "扣库存"],
    examples: ["给 HQ-BEER-001 出库 1 件"],
    argumentHints: '{"productQuery":"商品名/SKU","quantity":1,"remark":"备注"}',
  },
  warehouse_create_stock_check: {
    capabilities: ["盘点", "新建盘点", "库存盘点"],
    examples: ["创建一张库存盘点"],
    argumentHints: "{}",
  },
  finance_register_payment: {
    capabilities: ["登记收款", "登记回款", "订单到账", "核销收款"],
    examples: ["给订单 HQAI-FIN-15348961 登记收款 1 元"],
    argumentHints: '{"customerQuery":"客户手机号","orderNo":"HQ...","amount":5,"method":"TRANSFER"}',
  },
  receipts_issue_invoice: {
    capabilities: ["开票", "发票", "普票", "专票", "税号"],
    examples: ["给订单 HQBROWSERINV166053 开普票，购方测试公司"],
    argumentHints: '{"orderNo":"HQ...","type":"NORMAL","buyerName":"购方名称","buyerTaxNo":"税号"}',
  },
  settings_create_staff_user: {
    capabilities: ["创建员工", "新增账号", "后台账号"],
    examples: ["创建仓管员工李四 13900000000 密码 AiFull456"],
    argumentHints: '{"name":"员工姓名","phone":"13900000000","role":"WAREHOUSE","password":"至少6位"}',
  },
  settings_set_staff_status: {
    capabilities: ["启用员工", "禁用员工", "停用账号", "恢复账号"],
    examples: ["禁用员工 13900139088"],
    argumentHints: '{"userQuery":"员工手机号/姓名","isActive":false}',
  },
  settings_reset_staff_password: {
    capabilities: ["重置密码", "修改员工密码"],
    examples: ["重置员工 13900139088 密码为 AiFull456"],
    argumentHints: '{"userQuery":"员工手机号/姓名","password":"至少6位"}',
  },
  settings_save_business_config: {
    capabilities: ["业务参数", "修改配置", "起送金额", "拒单限制"],
    examples: ["把 bulkOrderAmount 调整为 999"],
    argumentHints: '{"key":"bulkOrderAmount","value":999}',
  },
  system_launch_readiness: {
    capabilities: ["上线检查", "发布检查", "部署配置", "还差什么", "就绪状态"],
    examples: ["现在上线还差什么配置", "发布前还有哪些阻塞项"],
    argumentHints: "{}",
  },
  system_completeness_audit: {
    capabilities: ["全系统完整度", "完整度检查", "上线前全系统检查", "系统还有哪些没完善", "功能缺口"],
    examples: ["全系统完整度还有哪些问题", "上线前系统还有哪些没完善"],
    argumentHints: "{}",
  },
  system_operational_acceptance: {
    capabilities: ["运营验收", "业务签收", "真实支付验证", "小程序体验版", "备份恢复演练", "运营接手"],
    examples: ["运营接手还差哪些验收", "业务签收和真实支付验证完成了吗"],
    argumentHints: "{}",
  },
  admin_approve_dealer_application: {
    capabilities: ["审核经销商", "通过经销商申请", "经销商入驻"],
    examples: ["通过 13900000000 的经销商申请"],
    argumentHints: '{"leadQuery":"申请人手机号","shopName":"门店名","zone":"雨湖区","latitude":27.8297,"longitude":112.9441,"serviceRadius":3000,"businessLicense":"TEST-LICENSE","salesPersonQuery":"销售员手机号","notes":"备注"}',
  },
  admin_reject_dealer_application: {
    capabilities: ["驳回经销商申请", "拒绝入驻"],
    examples: ["驳回 13900000000 的经销商申请，原因资料不全"],
    argumentHints: '{"leadQuery":"申请人手机号","reason":"驳回原因"}',
  },
  admin_update_dealer_policy: {
    capabilities: ["经销商政策", "起送金额", "价格等级", "跨区", "拒单规则", "优先级"],
    examples: ["调整某经销商起送金额为 100"],
    argumentHints: '{"dealerQuery":"经销商门店/手机号","minOrderAmount":100,"priceLevel":"WHOLESALE","allowCrossZone":true,"allowReject":true,"priority":2}',
  },
  admin_set_dealer_accepting: {
    capabilities: ["经销商接单状态", "暂停接单", "启用接单"],
    examples: ["暂停某经销商接单"],
    argumentHints: '{"dealerQuery":"经销商门店/手机号","isActive":false}',
  },
  admin_dealer_conflicts: {
    capabilities: ["经销商冲突", "拒单冲突", "渠道冲突"],
    examples: ["查看某经销商最近冲突"],
    argumentHints: '{"dealerQuery":"经销商门店/手机号","limit":8}',
  },
  marketing_create_coupon: {
    capabilities: ["创建优惠券", "新增优惠券", "营销券"],
    examples: ["创建满 100 减 10 优惠券 20 张"],
    argumentHints: '{"name":"优惠券名","couponType":"AMOUNT","amount":10,"threshold":100,"totalQuantity":20}',
  },
  marketing_issue_coupon: {
    capabilities: ["发券", "批量发优惠券", "按标签发券"],
    examples: ["给高价值客户发 10 元券"],
    argumentHints: '{"couponQuery":"优惠券名","tag":"客户标签"}',
  },
  marketing_create_product_push: {
    capabilities: ["新品推送", "产品推送", "商品推送", "按标签推送"],
    examples: ["把 HQ-BEER-001 推送给高价值人群，话术新品试饮"],
    argumentHints: '{"productQuery":"商品名/SKU","targetTag":"客户标签","message":"推送话术"}',
  },
  dealer_incoming_orders: {
    capabilities: ["经销商待接订单", "新订单", "待接单"],
    examples: ["有哪些待接订单"],
    argumentHints: "{}",
  },
  dealer_report_stock: {
    capabilities: ["经销商上报库存", "门店库存", "报库存", "库存有多少"],
    examples: ["上报 HQ-BEER-001 门店库存 9 件"],
    argumentHints: '{"productQuery":"商品名/SKU","stock":9}',
  },
  dealer_settlement_summary: {
    capabilities: ["经销商结算", "佣金", "经销商账款"],
    examples: ["我的结算怎么样", "本月佣金多少"],
    argumentHints: "{}",
  },
  dealer_accept_routing: {
    capabilities: ["经销商接单", "接受订单"],
    examples: ["接单 HQ20260430000007"],
    argumentHints: '{"routingId":"订单号或routingId"}',
  },
  dealer_reject_routing: {
    capabilities: ["经销商拒单", "拒绝订单"],
    examples: ["拒单 HQ20260430000008 原因太远"],
    argumentHints: '{"routingId":"订单号或routingId","reason":"拒单原因"}',
  },
  admin_create_product_draft: {
    capabilities: ["新增商品草稿", "创建产品草稿"],
    examples: ["新增一款 500ml 啤酒，零售价 12"],
    argumentHints: '{"text":"商品口述内容"}',
  },
  orders_manual_order_draft: {
    capabilities: ["后台开单草稿", "帮客户开单", "员工下单"],
    examples: ["帮客户开单 1 箱青岛经典啤酒"],
    argumentHints: '{"text":"开单口述内容"}',
  },
  marketing_coupon_draft: {
    capabilities: ["优惠券草稿", "优惠券活动"],
    examples: ["做一个满 100 减 10 的优惠券活动"],
    argumentHints: '{"text":"优惠券活动口述内容"}',
  },
  marketing_product_push_draft: {
    capabilities: ["新品推送草稿", "产品推送草稿"],
    examples: ["整理一个新品推送给高价值客户"],
    argumentHints: '{"text":"新品推送口述内容"}',
  },
};

for (const tool of aiTools) {
  const metadata = aiToolSemanticMetadata[tool.name];
  if (metadata) Object.assign(tool, metadata);
}

export function getAiToolByName(name: string) {
  return aiTools.find((tool) => tool.name === name) ?? null;
}

function describeAiToolForPrompt(tool: AiToolDefinition) {
  const capabilities = tool.capabilities?.length ? `；能力：${tool.capabilities.join("、")}` : "";
  const examples = tool.examples?.length ? `；示例：${tool.examples.join(" / ")}` : "";
  const argumentHints = tool.argumentHints ? `；参数：${tool.argumentHints}` : "";
  return `${tool.name}: ${tool.title}。${tool.description} [${tool.riskLevel}]${capabilities}${examples}${argumentHints}`;
}

export function describeAiToolsForPrompt(tools: readonly AiToolDefinition[]) {
  return tools.map(describeAiToolForPrompt).join("\n");
}

export function canRoleUseTool(role: AiToolContext["role"], toolName: string) {
  const tool = getAiToolByName(toolName);
  if (!tool) return false;
  if (tool.access?.roles && !tool.access.roles.includes(role)) return false;
  if (tool.access?.permission && !roleHasPermission(role, tool.access.permission)) return false;
  return true;
}
