import type { DealerPriceLevel, InquiryStatus, LeadScene, LeadStatus, Prisma, PromoterOwnerType, QuoteStatus } from "@prisma/client";

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

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getLeadDashboardData(searchParams: SearchParams) {
  const filters = {
    q: firstParam(searchParams.q),
    scene: enumOrUndefined(firstParam(searchParams.scene), leadScenes),
    status: enumOrUndefined(firstParam(searchParams.status), leadStatuses),
  };
  const where: Prisma.LeadWhereInput = {
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
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.lead.count({ where: { status: "CONVERTED" } }),
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
  const filters = {
    q: firstParam(searchParams.q),
    scene: enumOrUndefined(firstParam(searchParams.scene), leadScenes),
    status: enumOrUndefined(firstParam(searchParams.status), inquiryStatuses),
  };
  const where: Prisma.InquiryWhereInput = {
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
    prisma.inquiry.count({ where: { status: "QUOTED" } }),
    prisma.inquiry.count({ where: { status: "WON" } }),
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
  const filters = {
    q: firstParam(searchParams.q),
    ownerType: enumOrUndefined(firstParam(searchParams.ownerType), promoterOwnerTypes),
  };
  const where: Prisma.PromoterCodeWhereInput = {
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
  const filters = {
    q: firstParam(searchParams.q),
    status: enumOrUndefined(firstParam(searchParams.status), quoteStatuses),
  };
  const where: Prisma.QuoteWhereInput = {
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
  const [items, total, sentCount, acceptedCount, convertedCount] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: {
        inquiry: { select: { inquiryNo: true, scene: true, contactName: true, contactPhone: true, status: true } },
        creator: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.quote.count({ where }),
    prisma.quote.count({ where: { status: "SENT" } }),
    prisma.quote.count({ where: { status: "ACCEPTED" } }),
    prisma.quote.count({ where: { status: "CONVERTED" } }),
  ]);

  return {
    filters,
    summary: { total, sentCount, acceptedCount, convertedCount },
    items: items.map((item) => ({
      id: item.id,
      quoteNo: item.quoteNo,
      status: item.status,
      inquiryNo: item.inquiry.inquiryNo,
      inquiryStatus: item.inquiry.status,
      scene: item.inquiry.scene,
      contactName: item.inquiry.contactName,
      contactPhone: item.inquiry.contactPhone,
      totalAmount: formatCurrency(Number(item.totalAmount)),
      validUntil: item.validUntil ? formatDate(item.validUntil) : "-",
      creator: item.creator?.name ?? "-",
      createdAt: formatDateTime(item.createdAt),
    })),
  };
}

export async function getQuoteFormOptions() {
  const inquiries = await prisma.inquiry.findMany({
    where: { status: { in: ["NEW", "ASSIGNED", "QUOTED"] } },
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
  const [salespeople, dealers, campaigns] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SALESPERSON", isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.dealer.findMany({
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

export async function getDealerPolicyPageData(dealerId: string) {
  const [dealer, brands] = await Promise.all([
    prisma.dealer.findUnique({
      where: { id: dealerId },
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
