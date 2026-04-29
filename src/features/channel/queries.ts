import type { ChannelConflictStatus, ChannelConflictType, DealerPriceLevel, InquiryStatus, LeadScene, LeadStatus, Prisma, PromoterOwnerType, QuoteStatus } from "@prisma/client";

import { getSessionUser, type SessionUser } from "@/features/auth/guards";
import { firstParam, formatCurrency, formatDate, formatDateTime } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

function enumOrUndefined<T extends string>(value: string, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

const leadScenes = ["BANQUET", "GROUP_BUY", "RESTOCK", "GIFT", "NEW_PRODUCT_TRIAL", "RETAIL", "DEALER_JOIN", "OTHER"] as const;
const leadStatuses = ["NEW", "ASSIGNED", "FOLLOWING", "CONVERTED", "LOST"] as const;
const inquiryStatuses = ["NEW", "ASSIGNED", "QUOTED", "WON", "LOST", "CANCELLED"] as const;
const quoteStatuses = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"] as const;
const promoterOwnerTypes = ["SALESPERSON", "DEALER", "CAMPAIGN"] as const;
const channelConflictTypes = ["CROSS_ZONE", "PRICE_ANOMALY", "REJECTION", "COMPLAINT", "STOCK_MISMATCH", "OTHER"] as const;
const channelConflictStatuses = ["OPEN", "PROCESSING", "RESOLVED", "IGNORED"] as const;
const channelConflictEventStatusLabels: Record<string, string> = {
  OPEN: "待处理",
  PROCESSING: "处理中",
  RESOLVED: "已解决",
  IGNORED: "已忽略",
};

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function hasOrderItems(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    const productId = typeof row.productId === "string" ? row.productId.trim() : "";
    const quantity = typeof row.quantity === "number" ? row.quantity : typeof row.quantity === "string" ? Number(row.quantity) : 0;
    return Boolean(productId && Number.isFinite(quantity) && quantity > 0);
  });
}

function getQuoteConvertDisabledReason(item: { status: QuoteStatus; convertedOrderId: string | null; validUntil: Date | null; inquiry: { content: Prisma.JsonValue } }) {
  if (item.convertedOrderId || item.status === "CONVERTED") return "已转订单";
  if (item.status === "REJECTED") return "报价已拒绝";
  if (item.status === "EXPIRED" || (item.validUntil && item.validUntil.getTime() < Date.now())) return "报价已过期";
  if (item.status !== "SENT" && item.status !== "ACCEPTED") return "报价尚未发送";
  if (!hasOrderItems(item.inquiry.content)) return "缺少商品明细";
  return null;
}

function getConflictDetailText(detail: Prisma.JsonValue | null | undefined) {
  const object = jsonObject(detail);
  const text = object?.text;
  return typeof text === "string" && text.trim() ? text : "-";
}

function getLatestConflictEvent(detail: Prisma.JsonValue | null | undefined) {
  const object = jsonObject(detail);
  const events = Array.isArray(object?.events) ? object.events : [];
  const latest = [...events].reverse().find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
  if (!latest) return null;

  const note = typeof latest.note === "string" && latest.note.trim() ? latest.note : "";
  const status = typeof latest.status === "string" ? latest.status : "";
  const action = typeof latest.action === "string" ? latest.action : "";
  const at = typeof latest.at === "string" ? latest.at : "";

  return {
    label: note || (status ? `状态更新为${channelConflictEventStatusLabels[status] ?? status}` : action || "已更新"),
    at: at ? formatDateTime(at) : null,
  };
}

function andWhere<T extends object>(...items: T[]) {
  return { AND: items.filter((item) => Object.keys(item).length > 0) };
}

function leadScope(user: SessionUser | null): Prisma.LeadWhereInput {
  return user?.role === "SALESPERSON" ? { OR: [{ salespersonId: user.id }, { customer: { salesPersonId: user.id } }] } : {};
}

function inquiryScope(user: SessionUser | null): Prisma.InquiryWhereInput {
  return user?.role === "SALESPERSON" ? { OR: [{ salespersonId: user.id }, { customer: { salesPersonId: user.id } }] } : {};
}

function quoteScope(user: SessionUser | null): Prisma.QuoteWhereInput {
  return user?.role === "SALESPERSON" ? { OR: [{ createdById: user.id }, { inquiry: { salespersonId: user.id } }, { customer: { salesPersonId: user.id } }] } : {};
}

function promoterScope(user: SessionUser | null): Prisma.PromoterCodeWhereInput {
  return user?.role === "SALESPERSON" ? { salespersonId: user.id } : {};
}

function conflictScope(user: SessionUser | null): Prisma.ChannelConflictWhereInput {
  return user?.role === "SALESPERSON"
    ? { OR: [{ ownerId: user.id }, { customer: { salesPersonId: user.id } }, { dealer: { customer: { salesPersonId: user.id } } }] }
    : {};
}

export async function getLeadDashboardData(searchParams: SearchParams) {
  const user = await getSessionUser();
  const filters = {
    q: firstParam(searchParams.q),
    scene: enumOrUndefined(firstParam(searchParams.scene), leadScenes),
    status: enumOrUndefined(firstParam(searchParams.status), leadStatuses),
  };
  const filterWhere: Prisma.LeadWhereInput = {
    ...(filters.scene ? { scene: filters.scene as LeadScene } : {}),
    ...(filters.status ? { status: filters.status as LeadStatus } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q, mode: "insensitive" } },
            { notes: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: Prisma.LeadWhereInput = andWhere(filterWhere, leadScope(user));
  const [items, total, newCount, convertedCount] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        salesperson: { select: { name: true } },
        dealer: { select: { shopName: true } },
        promoterCode: { select: { code: true, label: true } },
        inquiries: { select: { inquiryNo: true, status: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.lead.count({ where }),
    prisma.lead.count({ where: andWhere({ status: "NEW" }, leadScope(user)) }),
    prisma.lead.count({ where: andWhere({ status: "CONVERTED" }, leadScope(user)) }),
  ]);

  return {
    filters,
    summary: { total, newCount, convertedCount },
    items: items.map((item) => ({
      id: item.id,
      source: item.source,
      scene: item.scene,
      status: item.status,
      name: item.name ?? item.customer?.name ?? "-",
      phone: item.phone ?? "-",
      salesperson: item.salesperson?.name ?? "-",
      dealer: item.dealer?.shopName ?? "-",
      promoter: item.promoterCode ? `${item.promoterCode.label} (${item.promoterCode.code})` : "-",
      inquiryNo: item.inquiries[0]?.inquiryNo ?? "-",
      inquiryStatus: item.inquiries[0]?.status ?? null,
      createdAt: formatDateTime(item.createdAt),
    })),
  };
}

export async function getInquiryDashboardData(searchParams: SearchParams) {
  const user = await getSessionUser();
  const filters = {
    q: firstParam(searchParams.q),
    scene: enumOrUndefined(firstParam(searchParams.scene), leadScenes),
    status: enumOrUndefined(firstParam(searchParams.status), inquiryStatuses),
  };
  const filterWhere: Prisma.InquiryWhereInput = {
    ...(filters.scene ? { scene: filters.scene as LeadScene } : {}),
    ...(filters.status ? { status: filters.status as InquiryStatus } : {}),
    ...(filters.q
      ? {
          OR: [
            { inquiryNo: { contains: filters.q, mode: "insensitive" } },
            { contactName: { contains: filters.q, mode: "insensitive" } },
            { contactPhone: { contains: filters.q, mode: "insensitive" } },
            { notes: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: Prisma.InquiryWhereInput = andWhere(filterWhere, inquiryScope(user));
  const [items, total, quotedCount, wonCount] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      include: {
        lead: { select: { source: true } },
        salesperson: { select: { name: true } },
        dealer: { select: { shopName: true } },
        quotes: { select: { quoteNo: true, status: true, totalAmount: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.inquiry.count({ where }),
    prisma.inquiry.count({ where: andWhere({ status: "QUOTED" }, inquiryScope(user)) }),
    prisma.inquiry.count({ where: andWhere({ status: "WON" }, inquiryScope(user)) }),
  ]);

  return {
    filters,
    summary: { total, quotedCount, wonCount },
    items: items.map((item) => ({
      id: item.id,
      inquiryNo: item.inquiryNo,
      scene: item.scene,
      status: item.status,
      source: item.lead?.source ?? "MANUAL",
      contactName: item.contactName,
      contactPhone: item.contactPhone,
      budget: item.budget ? formatCurrency(Number(item.budget)) : "-",
      salesperson: item.salesperson?.name ?? "-",
      dealer: item.dealer?.shopName ?? "-",
      quoteNo: item.quotes[0]?.quoteNo ?? "-",
      quoteAmount: item.quotes[0]?.totalAmount ? formatCurrency(Number(item.quotes[0].totalAmount)) : "-",
      createdAt: formatDateTime(item.createdAt),
    })),
  };
}

export async function getPromoterDashboardData(searchParams: SearchParams) {
  const user = await getSessionUser();
  const filters = {
    q: firstParam(searchParams.q),
    ownerType: enumOrUndefined(firstParam(searchParams.ownerType), promoterOwnerTypes),
  };
  const filterWhere: Prisma.PromoterCodeWhereInput = {
    ...(filters.ownerType ? { ownerType: filters.ownerType as PromoterOwnerType } : {}),
    ...(filters.q
      ? {
          OR: [
            { code: { contains: filters.q, mode: "insensitive" } },
            { label: { contains: filters.q, mode: "insensitive" } },
            { salesperson: { name: { contains: filters.q, mode: "insensitive" } } },
            { dealer: { shopName: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const where: Prisma.PromoterCodeWhereInput = andWhere(filterWhere, promoterScope(user));
  const items = await prisma.promoterCode.findMany({
    where,
    include: {
      salesperson: { select: { name: true } },
      dealer: { select: { shopName: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    filters,
    summary: {
      total: items.length,
      scans: items.reduce((sum, item) => sum + item.scanCount, 0),
      leads: items.reduce((sum, item) => sum + item.leadCount, 0),
      orders: items.reduce((sum, item) => sum + item.orderCount, 0),
    },
    items: items.map((item) => ({
      id: item.id,
      code: item.code,
      label: item.label,
      ownerType: item.ownerType,
      scene: item.scene,
      owner: item.salesperson?.name ?? item.dealer?.shopName ?? item.campaign?.name ?? "-",
      isActive: item.isActive,
      scanCount: item.scanCount,
      leadCount: item.leadCount,
      orderCount: item.orderCount,
      createdAt: formatDateTime(item.createdAt),
    })),
  };
}

export async function getQuoteDashboardData(searchParams: SearchParams) {
  const user = await getSessionUser();
  const filters = {
    q: firstParam(searchParams.q),
    status: enumOrUndefined(firstParam(searchParams.status), quoteStatuses),
  };
  const filterWhere: Prisma.QuoteWhereInput = {
    ...(filters.status ? { status: filters.status as QuoteStatus } : {}),
    ...(filters.q
      ? {
          OR: [
            { quoteNo: { contains: filters.q, mode: "insensitive" } },
            { inquiry: { inquiryNo: { contains: filters.q, mode: "insensitive" } } },
            { inquiry: { contactName: { contains: filters.q, mode: "insensitive" } } },
            { inquiry: { contactPhone: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const where: Prisma.QuoteWhereInput = andWhere(filterWhere, quoteScope(user));
  const [items, total, sentCount, acceptedCount, convertedCount] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: {
        inquiry: { select: { inquiryNo: true, scene: true, contactName: true, contactPhone: true, status: true, content: true } },
        creator: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.quote.count({ where }),
    prisma.quote.count({ where: andWhere({ status: "SENT" }, quoteScope(user)) }),
    prisma.quote.count({ where: andWhere({ status: "ACCEPTED" }, quoteScope(user)) }),
    prisma.quote.count({ where: andWhere({ status: "CONVERTED" }, quoteScope(user)) }),
  ]);

  return {
    filters,
    summary: { total, sentCount, acceptedCount, convertedCount },
    items: items.map((item) => {
      const convertDisabledReason = getQuoteConvertDisabledReason(item);
      return {
        id: item.id,
        quoteNo: item.quoteNo,
        status: item.status,
        convertedOrderId: item.convertedOrderId,
        inquiryNo: item.inquiry.inquiryNo,
        inquiryStatus: item.inquiry.status,
        scene: item.inquiry.scene,
        contactName: item.inquiry.contactName,
        contactPhone: item.inquiry.contactPhone,
        totalAmount: formatCurrency(Number(item.totalAmount)),
        validUntil: item.validUntil ? formatDate(item.validUntil) : "-",
        creator: item.creator?.name ?? "-",
        canConvert: !convertDisabledReason,
        convertDisabledReason,
        createdAt: formatDateTime(item.createdAt),
      };
    }),
  };
}

export async function getQuoteFormOptions() {
  const user = await getSessionUser();
  const inquiries = await prisma.inquiry.findMany({
    where: andWhere({ status: { in: ["NEW", "ASSIGNED", "QUOTED"] } }, inquiryScope(user)),
    select: {
      id: true,
      inquiryNo: true,
      scene: true,
      contactName: true,
      contactPhone: true,
      budget: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    inquiries: inquiries.map((item) => ({
      id: item.id,
      inquiryNo: item.inquiryNo,
      scene: item.scene,
      contactName: item.contactName,
      contactPhone: item.contactPhone,
      budget: item.budget ? Number(item.budget) : null,
      createdAt: formatDateTime(item.createdAt),
    })),
  };
}

export type QuoteFormOptions = Awaited<ReturnType<typeof getQuoteFormOptions>>;

export async function getPromoterFormOptions() {
  const user = await getSessionUser();
  const [salespeople, dealers, campaigns] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SALESPERSON", isActive: true, ...(user?.role === "SALESPERSON" ? { id: user.id } : {}) },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.dealer.findMany({
      where: user?.role === "SALESPERSON" ? { customer: { salesPersonId: user.id } } : {},
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { shopName: "asc" },
      take: 300,
    }),
    prisma.campaign.findMany({
      where: { status: { in: ["DRAFT", "ACTIVE"] } },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    salespeople: salespeople.map((item) => ({ id: item.id, label: `${item.name} · ${item.phone}` })),
    dealers: dealers.map((item) => ({ id: item.id, label: `${item.shopName} · ${item.customer.name}` })),
    campaigns: campaigns.map((item) => ({ id: item.id, label: `${item.name} · ${item.status}` })),
  };
}

export type PromoterFormOptions = Awaited<ReturnType<typeof getPromoterFormOptions>>;

export async function getChannelConflictDashboardData(searchParams: SearchParams) {
  const user = await getSessionUser();
  const filters = {
    q: firstParam(searchParams.q).trim(),
    type: enumOrUndefined(firstParam(searchParams.type), channelConflictTypes),
    status: enumOrUndefined(firstParam(searchParams.status), channelConflictStatuses),
  };
  const matchedOrderIds = filters.q
    ? (
        await prisma.order.findMany({
          where: { orderNo: { contains: filters.q, mode: "insensitive" } },
          select: { id: true },
          take: 50,
        })
      ).map((item) => item.id)
    : [];

  const searchFilters: Prisma.ChannelConflictWhereInput[] = [];
  if (filters.q) {
    searchFilters.push(
      { summary: { contains: filters.q, mode: "insensitive" } },
      { orderId: { contains: filters.q, mode: "insensitive" } },
      { dealer: { shopName: { contains: filters.q, mode: "insensitive" } } },
      { dealer: { customer: { name: { contains: filters.q, mode: "insensitive" } } } },
      { dealer: { customer: { phone: { contains: filters.q, mode: "insensitive" } } } },
      { customer: { name: { contains: filters.q, mode: "insensitive" } } },
      { customer: { phone: { contains: filters.q, mode: "insensitive" } } },
    );
    if (matchedOrderIds.length > 0) {
      searchFilters.push({ orderId: { in: matchedOrderIds } });
    }
  }

  const filterWhere: Prisma.ChannelConflictWhereInput = {
    ...(filters.type ? { type: filters.type as ChannelConflictType } : {}),
    ...(filters.status ? { status: filters.status as ChannelConflictStatus } : {}),
    ...(searchFilters.length > 0 ? { OR: searchFilters } : {}),
  };
  const where: Prisma.ChannelConflictWhereInput = andWhere(filterWhere, conflictScope(user));

  const [items, total, openCount, processingCount, resolvedCount, ignoredCount] = await Promise.all([
    prisma.channelConflict.findMany({
      where,
      include: {
        dealer: { include: { customer: { select: { name: true, phone: true } } } },
        customer: { select: { name: true, phone: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.channelConflict.count({ where }),
    prisma.channelConflict.count({ where: andWhere({ status: "OPEN" }, conflictScope(user)) }),
    prisma.channelConflict.count({ where: andWhere({ status: "PROCESSING" }, conflictScope(user)) }),
    prisma.channelConflict.count({ where: andWhere({ status: "RESOLVED" }, conflictScope(user)) }),
    prisma.channelConflict.count({ where: andWhere({ status: "IGNORED" }, conflictScope(user)) }),
  ]);

  const orderIds = Array.from(new Set(items.map((item) => item.orderId).filter((id): id is string => Boolean(id))));
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderNo: true,
          status: true,
          payableAmount: true,
          address: { select: { district: true, detail: true } },
        },
      })
    : [];
  const orderMap = new Map(orders.map((order) => [order.id, order]));

  return {
    filters,
    summary: { total, openCount, processingCount, resolvedCount, ignoredCount },
    items: items.map((item) => {
      const order = item.orderId ? orderMap.get(item.orderId) : undefined;
      return {
        id: item.id,
        type: item.type,
        status: item.status,
        summary: item.summary,
        detailText: getConflictDetailText(item.detail),
        latestEvent: getLatestConflictEvent(item.detail),
        orderId: item.orderId,
        orderNo: order?.orderNo ?? item.orderId ?? "-",
        orderStatus: order?.status ?? null,
        orderAmount: order ? formatCurrency(Number(order.payableAmount)) : "-",
        orderAddress: order ? `${order.address.district}${order.address.detail}` : "-",
        dealer: item.dealer
          ? {
              id: item.dealer.id,
              shopName: item.dealer.shopName,
              zone: item.dealer.zone,
              contact: `${item.dealer.customer.name} · ${item.dealer.customer.phone}`,
            }
          : null,
        customer: item.customer ? { id: item.customerId, name: item.customer.name, phone: item.customer.phone } : null,
        ownerId: item.ownerId,
        ownerName: item.owner?.name ?? "待分派",
        createdAt: formatDateTime(item.createdAt),
        resolvedAt: item.resolvedAt ? formatDateTime(item.resolvedAt) : "-",
      };
    }),
  };
}

export async function getChannelConflictFormOptions() {
  const user = await getSessionUser();
  const [orders, dealers, customers, owners] = await Promise.all([
    prisma.order.findMany({
      where: user?.role === "SALESPERSON" ? { OR: [{ salesPersonId: user.id }, { customer: { salesPersonId: user.id } }] } : {},
      select: {
        id: true,
        orderNo: true,
        payableAmount: true,
        customer: { select: { name: true, phone: true } },
        address: { select: { district: true, detail: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.dealer.findMany({
      where: user?.role === "SALESPERSON" ? { customer: { salesPersonId: user.id } } : {},
      select: { id: true, shopName: true, zone: true, customer: { select: { name: true, phone: true } } },
      orderBy: { shopName: "asc" },
      take: 300,
    }),
    prisma.customer.findMany({
      where: user?.role === "SALESPERSON" ? { salesPersonId: user.id } : {},
      select: { id: true, name: true, phone: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: user?.role === "SALESPERSON" ? ["SALESPERSON"] : ["ADMIN", "SALESPERSON"] },
        ...(user?.role === "SALESPERSON" ? { id: user.id } : {}),
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    orders: orders.map((item) => ({
      id: item.id,
      label: `${item.orderNo} · ${item.customer.name} · ${formatCurrency(Number(item.payableAmount))}`,
      address: `${item.address.district}${item.address.detail}`,
    })),
    dealers: dealers.map((item) => ({
      id: item.id,
      label: `${item.shopName} · ${item.customer.name} · ${item.zone}`,
      phone: item.customer.phone,
    })),
    customers: customers.map((item) => ({
      id: item.id,
      label: `${item.name} · ${item.phone}`,
    })),
    owners: owners.map((item) => ({
      id: item.id,
      label: `${item.name} · ${item.role}`,
    })),
  };
}

export type ChannelConflictFormOptions = Awaited<ReturnType<typeof getChannelConflictFormOptions>>;

export async function getDealerPolicyPageData(dealerId: string) {
  const user = await getSessionUser();
  const [dealer, brands] = await Promise.all([
    prisma.dealer.findFirst({
      where: { id: dealerId, ...(user?.role === "SALESPERSON" ? { customer: { salesPersonId: user.id } } : {}) },
      include: {
        customer: { select: { name: true, phone: true } },
        policy: true,
      },
    }),
    prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!dealer) return null;

  return {
    dealer: {
      id: dealer.id,
      shopName: dealer.shopName,
      zone: dealer.zone,
      serviceRadius: dealer.serviceRadius,
      isAccepting: dealer.isAccepting,
      customerName: dealer.customer.name,
      customerPhone: dealer.customer.phone,
      policy: dealer.policy
        ? {
            minOrderAmount: Number(dealer.policy.minOrderAmount),
            maxOrderAmount: dealer.policy.maxOrderAmount ? Number(dealer.policy.maxOrderAmount) : null,
            priceLevel: dealer.policy.priceLevel as DealerPriceLevel,
            allowCrossZone: dealer.policy.allowCrossZone,
            allowReject: dealer.policy.allowReject,
            rejectLimitPerDay: dealer.policy.rejectLimitPerDay,
            priority: dealer.policy.priority,
            brandIds: jsonStringArray(dealer.policy.brandIds),
            notes: dealer.policy.notes,
          }
        : null,
    },
    brands,
  };
}

export type DealerPolicyPageData = NonNullable<Awaited<ReturnType<typeof getDealerPolicyPageData>>>;
