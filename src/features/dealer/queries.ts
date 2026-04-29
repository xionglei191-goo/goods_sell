import { redirect } from "next/navigation";
import type { LeadScene, LeadStatus, Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { getWechatConfig } from "@/features/wechat/config";
import { firstParam, formatCurrency, formatDateTime, orderStatusLabels } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type DealerRoutingPayload = Prisma.OrderRoutingGetPayload<{
  include: {
    order: {
      include: {
        customer: { select: { name: true } };
        address: true;
        items: true;
      };
    };
  };
}>;

async function getDealerId(callbackUrl = "/dealer/incoming") {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "DEALER") {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const dealer = await prisma.dealer.findUnique({
    where: { customerId: session.user.id },
    include: { customer: { select: { name: true, phone: true } } },
  });

  if (!dealer) {
    redirect("/shop");
  }

  return dealer;
}

function mapRouting(routing: DealerRoutingPayload) {
  const status = routing.order.status as keyof typeof orderStatusLabels;
  return {
    routingId: routing.id,
    orderId: routing.order.id,
    orderNo: routing.order.orderNo,
    status,
    statusLabel: orderStatusLabels[status],
    amount: Number(routing.order.payableAmount),
    amountText: formatCurrency(Number(routing.order.payableAmount)),
    distance: Number(routing.distance),
    createdAt: routing.order.createdAt.toISOString(),
    address: `${routing.order.address.district}${routing.order.address.detail}`,
    customer: routing.order.customer.name,
    items: routing.order.items.map((item: { productName: string; quantity: number }) => ({
      name: item.productName,
      quantity: item.quantity,
    })),
  };
}

function enumOrUndefined<T extends string>(value: string, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function buildScenePath(scene: LeadScene | null) {
  if (scene === "BANQUET") return "/shop/scenes/banquet";
  if (scene === "GROUP_BUY") return "/shop/scenes/group-buy";
  return "/shop/scenes/restock";
}

function buildPromoterUrl(appUrl: string, code: string, scene: LeadScene | null) {
  const url = new URL(buildScenePath(scene), appUrl.replace(/\/$/, ""));
  url.searchParams.set("ref", code);
  return url.toString();
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function leadFieldSummary(metadata: Prisma.JsonValue | null | undefined) {
  const object = jsonObject(metadata);
  const fields = jsonObject(object?.fields as Prisma.JsonValue | null | undefined);
  if (!fields) return [];
  return Object.entries(fields)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`);
}

export async function getDealerLayoutData() {
  const dealer = await getDealerId();
  return {
    dealer: {
      id: dealer.id,
      name: dealer.shopName,
      zone: dealer.zone,
      phone: dealer.customer.phone,
      isAccepting: dealer.isAccepting,
    },
  };
}

export async function getIncomingOrders() {
  const dealer = await getDealerId("/dealer/incoming");
  const routings = await prisma.orderRouting.findMany({
    where: { dealerId: dealer.id, status: "PENDING" },
    include: {
      order: {
        include: {
          customer: { select: { name: true } },
          address: true,
          items: true,
        },
      },
    },
    orderBy: { assignedAt: "asc" },
  });

  return routings.map((routing) => mapRouting(routing));
}

export async function getDealerOrders() {
  const dealer = await getDealerId("/dealer/my-orders");
  const routings = await prisma.orderRouting.findMany({
    where: {
      dealerId: dealer.id,
      status: "ACCEPTED",
      order: { status: { in: ["CONFIRMED", "PAID", "SHIPPING", "DELIVERED", "COMPLETED"] } },
    },
    include: {
      order: {
        include: {
          customer: { select: { name: true } },
          address: true,
          items: true,
        },
      },
    },
    orderBy: { respondedAt: "desc" },
  });

  return routings.map((routing) => mapRouting(routing));
}

export async function getDealerSettlement() {
  const dealer = await getDealerId("/dealer/settlement");
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const routings = await prisma.orderRouting.findMany({
    where: {
      dealerId: dealer.id,
      status: "ACCEPTED",
      order: { status: "COMPLETED", updatedAt: { gte: start } },
    },
    include: {
      order: { include: { items: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const orders = routings.map((routing) => ({
    id: routing.order.id,
    orderNo: routing.order.orderNo,
    completedAt: routing.order.updatedAt.toISOString(),
    amount: Number(routing.order.payableAmount),
    settlementAmount: Number(routing.order.payableAmount) * 0.9,
  }));

  return {
    orders,
    completedCount: orders.length,
    totalAmount: orders.reduce((sum, order) => sum + order.amount, 0),
    settlementAmount: orders.reduce((sum, order) => sum + order.settlementAmount, 0),
  };
}

const dealerLeadStatuses = ["NEW", "ASSIGNED", "FOLLOWING", "CONVERTED", "LOST"] as const;
const dealerLeadScenes = ["BANQUET", "GROUP_BUY", "RESTOCK", "GIFT", "NEW_PRODUCT_TRIAL", "RETAIL", "DEALER_JOIN", "OTHER"] as const;
const dealerPromoterScenes = ["BANQUET", "GROUP_BUY", "RESTOCK"] as const;

export async function getDealerPromotion() {
  const dealer = await getDealerId("/dealer/promotion");
  const appUrl = getWechatConfig().appUrl.replace(/\/$/, "");
  const dealerLeadWhere: Prisma.LeadWhereInput = { dealerId: dealer.id };

  const [codes, recentLeads, leadCount, convertedQuotes, completedRoutingCount] = await Promise.all([
    prisma.promoterCode.findMany({
      where: { dealerId: dealer.id, ownerType: "DEALER" },
      include: {
        _count: { select: { leads: true } },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    prisma.lead.findMany({
      where: dealerLeadWhere,
      include: {
        promoterCode: { select: { code: true, label: true, scene: true } },
        inquiries: {
          select: { inquiryNo: true, status: true, budget: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.lead.count({ where: dealerLeadWhere }),
    prisma.quote.findMany({
      where: { convertedOrderId: { not: null }, inquiry: { dealerId: dealer.id } },
      select: { totalAmount: true },
    }),
    prisma.orderRouting.count({
      where: {
        dealerId: dealer.id,
        status: "ACCEPTED",
        order: { status: { in: ["DELIVERED", "COMPLETED"] } },
      },
    }),
  ]);

  const activeScenes = new Set(codes.filter((code) => code.isActive && code.scene).map((code) => code.scene as LeadScene));
  const primaryCode = codes.find((code) => code.isActive) ?? codes[0] ?? null;
  const convertedAmount = convertedQuotes.reduce((sum, quote) => sum + Number(quote.totalAmount), 0);

  return {
    dealer: {
      id: dealer.id,
      name: dealer.shopName,
      zone: dealer.zone,
      isAccepting: dealer.isAccepting,
    },
    summary: {
      codeCount: codes.length,
      activeCodeCount: codes.filter((code) => code.isActive).length,
      scans: codes.reduce((sum, code) => sum + code.scanCount, 0),
      leads: leadCount,
      convertedOrders: convertedQuotes.length,
      fulfilledOrders: completedRoutingCount,
      convertedAmount,
    },
    missingScenes: dealerPromoterScenes.filter((scene) => !activeScenes.has(scene)),
    primaryLinks: primaryCode
      ? dealerPromoterScenes.map((scene) => ({
          scene,
          url: buildPromoterUrl(appUrl, primaryCode.code, scene),
        }))
      : [],
    codes: codes.map((code) => ({
      id: code.id,
      code: code.code,
      label: code.label,
      scene: code.scene,
      isActive: code.isActive,
      scanCount: code.scanCount,
      leadCount: Math.max(code.leadCount, code._count.leads),
      orderCount: code.orderCount,
      primaryUrl: buildPromoterUrl(appUrl, code.code, code.scene),
      createdAt: formatDateTime(code.createdAt),
    })),
    recentLeads: recentLeads.map((lead) => {
      const inquiry = lead.inquiries[0];
      return {
        id: lead.id,
        name: lead.name ?? "未留姓名",
        phone: lead.phone ?? "-",
        scene: lead.scene,
        status: lead.status,
        promoter: lead.promoterCode?.label ?? lead.promoterCode?.code ?? "-",
        inquiryNo: inquiry?.inquiryNo ?? "-",
        inquiryStatus: inquiry?.status ?? null,
        budget: inquiry?.budget ? formatCurrency(Number(inquiry.budget)) : "-",
        createdAt: formatDateTime(lead.createdAt),
      };
    }),
  };
}

export async function getDealerLeads(searchParams: Record<string, string | string[] | undefined>) {
  const dealer = await getDealerId("/dealer/leads");
  const filters = {
    status: enumOrUndefined(firstParam(searchParams.status), dealerLeadStatuses),
    scene: enumOrUndefined(firstParam(searchParams.scene), dealerLeadScenes),
  };
  const where: Prisma.LeadWhereInput = {
    dealerId: dealer.id,
    ...(filters.status ? { status: filters.status as LeadStatus } : {}),
    ...(filters.scene ? { scene: filters.scene as LeadScene } : {}),
  };

  const [items, total, newCount, followingCount, convertedCount] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        promoterCode: { select: { code: true, label: true, scene: true } },
        inquiries: {
          select: {
            inquiryNo: true,
            status: true,
            budget: true,
            expectedDate: true,
            createdAt: true,
            quotes: {
              select: { quoteNo: true, status: true, totalAmount: true, convertedOrderId: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { dealerId: dealer.id, status: "NEW" } }),
    prisma.lead.count({ where: { dealerId: dealer.id, status: "FOLLOWING" } }),
    prisma.lead.count({ where: { dealerId: dealer.id, status: "CONVERTED" } }),
  ]);

  return {
    filters,
    summary: { total, newCount, followingCount, convertedCount },
    items: items.map((lead) => {
      const inquiry = lead.inquiries[0];
      const quote = inquiry?.quotes[0];
      return {
        id: lead.id,
        name: lead.name ?? "未留姓名",
        phone: lead.phone ?? "-",
        scene: lead.scene,
        source: lead.source,
        status: lead.status,
        promoter: lead.promoterCode?.label ?? lead.promoterCode?.code ?? "-",
        fieldSummary: leadFieldSummary(lead.metadata),
        notes: lead.notes,
        inquiry: inquiry
          ? {
              inquiryNo: inquiry.inquiryNo,
              status: inquiry.status,
              budget: inquiry.budget ? formatCurrency(Number(inquiry.budget)) : "-",
              expectedDate: inquiry.expectedDate ? formatDateTime(inquiry.expectedDate) : null,
            }
          : null,
        quote: quote
          ? {
              quoteNo: quote.quoteNo,
              status: quote.status,
              amount: formatCurrency(Number(quote.totalAmount)),
              convertedOrderId: quote.convertedOrderId,
            }
          : null,
        createdAt: formatDateTime(lead.createdAt),
      };
    }),
  };
}

export async function getDealerStock() {
  const dealer = await getDealerId("/dealer/stock");
  const [products, stocks] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ category: { name: "asc" } }, { brand: { name: "asc" } }, { name: "asc" }],
      take: 100,
    }),
    prisma.dealerStock.findMany({
      where: { dealerId: dealer.id },
      include: {
        product: {
          include: {
            brand: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const stockMap = new Map(stocks.map((stock) => [stock.productId, stock]));
  const rows = products.map((product) => {
    const stock = stockMap.get(product.id);
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand.name,
      category: product.category.name,
      spec: product.spec ?? product.unit,
      platformStock: product.stock,
      dealerStock: stock?.stock ?? 0,
      reportedAt: stock ? formatDateTime(stock.reportedAt) : "未上报",
      updatedAt: stock?.updatedAt ?? null,
    };
  });
  const reportedRows = rows.filter((row) => row.updatedAt !== null);

  return {
    summary: {
      productCount: rows.length,
      reportedCount: reportedRows.length,
      availableCount: rows.filter((row) => row.dealerStock > 0).length,
      totalStock: rows.reduce((sum, row) => sum + row.dealerStock, 0),
      lowCount: rows.filter((row) => row.dealerStock > 0 && row.dealerStock <= 3).length,
    },
    rows: rows.sort((a, b) => {
      if (a.dealerStock === 0 && b.dealerStock > 0) return 1;
      if (a.dealerStock > 0 && b.dealerStock === 0) return -1;
      return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
    }),
  };
}
