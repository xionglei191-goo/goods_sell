import type { ProductPushStatus, Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { formatCurrency, formatDateTime } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function profileLabels(tags: unknown) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    return [];
  }

  const labels = (tags as { labels?: unknown }).labels;
  return Array.isArray(labels) ? labels.filter((item): item is string => typeof item === "string") : [];
}

function reasonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function reasonEvents(value: Prisma.JsonValue | null | undefined) {
  const events = reasonObject(value).events;
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) return null;
      const row = event as Record<string, unknown>;
      return {
        event: typeof row.event === "string" ? row.event : "",
        label: typeof row.label === "string" ? row.label : "",
        at: typeof row.at === "string" ? row.at : "",
      };
    })
    .filter((event): event is { event: string; label: string; at: string } => Boolean(event?.event));
}

export async function getMarketingCoupons() {
  const coupons = await prisma.coupon.findMany({
    include: { holders: true },
    orderBy: { createdAt: "desc" },
  });
  const customers = await prisma.customer.findMany({
    include: { profile: true, tags: true },
    orderBy: { createdAt: "desc" },
  });

  const targetTags = Array.from(
    new Set(
      customers.flatMap((customer) => {
        const profileTags = customer.profile?.tags && typeof customer.profile.tags === "object" ? ((customer.profile.tags as { labels?: string[] }).labels ?? []) : [];
        return [...customer.tags.map((tag) => tag.name), ...profileTags];
      }),
    ),
  );

  return {
    coupons: coupons.map((coupon) => ({
      id: coupon.id,
      name: coupon.name,
      type: coupon.type,
      amount: coupon.amount ? Number(coupon.amount) : null,
      percent: coupon.percent ? Number(coupon.percent) : null,
      threshold: Number(coupon.threshold),
      totalQuantity: coupon.totalQuantity,
      issuedQuantity: coupon.issuedQuantity,
      usedQuantity: coupon.usedQuantity,
      startsAt: coupon.startsAt.toISOString(),
      endsAt: coupon.endsAt.toISOString(),
      isActive: coupon.isActive,
      holders: coupon.holders.length,
    })),
    targetTags,
  };
}

export async function getProductPushDashboardData() {
  const [pushes, products, customers] = await Promise.all([
    prisma.productPush.findMany({
      include: {
        product: { include: { brand: { select: { name: true } }, category: { select: { name: true } } } },
        customer: { select: { name: true, phone: true, tags: true, profile: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: { brand: { select: { name: true } }, category: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.customer.findMany({
      include: { profile: true, tags: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  const statusCounts = pushes.reduce(
    (acc, push) => {
      acc[push.status] += 1;
      return acc;
    },
    { DRAFT: 0, SENT: 0, OPENED: 0, CLICKED: 0, CONVERTED: 0, CANCELLED: 0 } satisfies Record<ProductPushStatus, number>,
  );
  const eventCounts = pushes.reduce(
    (acc, push) => {
      for (const event of reasonEvents(push.reason)) {
        if (event.event === "CONSULTED") acc.consulted += 1;
        if (event.event === "TRIAL") acc.trial += 1;
        if (event.event === "ORDERED") acc.ordered += 1;
        if (event.event === "REPURCHASED") acc.repurchase += 1;
      }
      return acc;
    },
    { consulted: 0, trial: 0, ordered: 0, repurchase: 0 },
  );
  const tagCounts = new Map<string, number>();
  for (const customer of customers) {
    const labels = [...customer.tags.map((tag) => tag.name), ...profileLabels(customer.profile?.tags)];
    for (const label of new Set(labels)) {
      tagCounts.set(label, (tagCounts.get(label) ?? 0) + 1);
    }
  }

  return {
    summary: {
      total: pushes.length,
      sent: statusCounts.SENT + statusCounts.OPENED + statusCounts.CLICKED + statusCounts.CONVERTED,
      opened: statusCounts.OPENED + statusCounts.CLICKED + statusCounts.CONVERTED,
      consulted: eventCounts.consulted,
      trial: eventCounts.trial,
      ordered: eventCounts.ordered,
      repurchase: eventCounts.repurchase,
      converted: statusCounts.CONVERTED,
    },
    form: {
      products: products.map((product) => ({
        id: product.id,
        label: `${product.name} · ${product.brand.name} · ${formatCurrency(Number(product.retailPrice))}`,
        meta: `${product.category.name} · 库存 ${product.stock} · ${formatDateTime(product.createdAt)}`,
      })),
      targetTags: Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    },
    items: pushes.map((push) => {
      const events = reasonEvents(push.reason);
      return {
        id: push.id,
        status: push.status,
        productName: push.product?.name ?? "商品已下架",
        productMeta: push.product ? `${push.product.brand.name} · ${push.product.category.name}` : "-",
        customerName: push.customer?.name ?? "客户已删除",
        customerPhone: push.customer?.phone ?? "-",
        targetTag: push.targetTag ?? "-",
        message: push.message,
        sentAt: push.sentAt ? formatDateTime(push.sentAt) : "-",
        openedAt: push.openedAt ? formatDateTime(push.openedAt) : "-",
        clickedAt: push.clickedAt ? formatDateTime(push.clickedAt) : "-",
        convertedAt: push.convertedAt ? formatDateTime(push.convertedAt) : "-",
        latestEvent: events.at(-1)?.label ?? "-",
        eventTrail: events.map((event) => `${event.label} ${event.at ? formatDateTime(event.at) : ""}`),
        createdAt: formatDateTime(push.createdAt),
      };
    }),
  };
}

export async function getMyCoupons() {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "CONSUMER") {
    return [];
  }

  const now = new Date();
  const coupons = await prisma.customerCoupon.findMany({
    where: { customerId: session.user.id },
    include: { coupon: true },
    orderBy: { receivedAt: "desc" },
  });

  return coupons.map((item) => ({
    id: item.id,
    status: item.status === "UNUSED" && item.coupon.endsAt < now ? "EXPIRED" : item.status,
    receivedAt: item.receivedAt.toISOString(),
    usedAt: item.usedAt?.toISOString() ?? null,
    coupon: {
      name: item.coupon.name,
      type: item.coupon.type,
      amount: item.coupon.amount ? Number(item.coupon.amount) : null,
      percent: item.coupon.percent ? Number(item.coupon.percent) : null,
      threshold: Number(item.coupon.threshold),
      startsAt: item.coupon.startsAt.toISOString(),
      endsAt: item.coupon.endsAt.toISOString(),
    },
  }));
}

export async function getMarketingOperations() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const last14Start = addDays(todayStart, -13);
  const last30Start = addDays(todayStart, -29);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [customers, orders, chats, checkIns, coupons, customerCoupons, profiles, customerTags] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, createdAt: true } }),
    prisma.order.findMany({
      where: { createdAt: { gte: last30Start }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      select: { customerId: true, payableAmount: true, discountAmount: true, createdAt: true },
    }),
    prisma.chatHistory.findMany({
      where: { createdAt: { gte: last30Start }, role: "USER" },
      select: { customerId: true, createdAt: true },
    }),
    prisma.checkIn.findMany({
      where: { date: { gte: last30Start } },
      select: { customerId: true, date: true },
    }),
    prisma.coupon.findMany({ include: { holders: true }, orderBy: { createdAt: "desc" } }),
    prisma.customerCoupon.findMany({ select: { status: true, couponId: true, usedAt: true, receivedAt: true } }),
    prisma.userProfile.findMany({ select: { lifecycle: true, tags: true } }),
    prisma.customerTag.findMany({ select: { name: true } }),
  ]);

  const activeToday = new Set<string>();
  const activeMonth = new Set<string>();
  const dailyActive = new Map<string, Set<string>>();
  const dailyNewUsers = new Map<string, number>();

  for (let index = 0; index < 14; index += 1) {
    const date = addDays(last14Start, index);
    dailyActive.set(dayKey(date), new Set());
    dailyNewUsers.set(dayKey(date), 0);
  }

  for (const customer of customers) {
    if (customer.createdAt >= monthStart) {
      activeMonth.add(customer.id);
    }
    const key = dayKey(customer.createdAt);
    if (dailyNewUsers.has(key)) {
      dailyNewUsers.set(key, (dailyNewUsers.get(key) ?? 0) + 1);
    }
  }

  const touch = (customerId: string, date: Date) => {
    if (date >= todayStart && date < tomorrowStart) activeToday.add(customerId);
    if (date >= last30Start) activeMonth.add(customerId);
    const key = dayKey(date);
    dailyActive.get(key)?.add(customerId);
  };

  for (const order of orders) touch(order.customerId, order.createdAt);
  for (const chat of chats) touch(chat.customerId, chat.createdAt);
  for (const checkIn of checkIns) touch(checkIn.customerId, checkIn.date);

  const issuedCoupons = customerCoupons.length;
  const usedCoupons = customerCoupons.filter((item) => item.status === "USED").length;
  const couponRevenue = orders.filter((order) => Number(order.discountAmount) > 0).reduce((sum, order) => sum + Number(order.payableAmount), 0);
  const tagCounts = new Map<string, number>();
  for (const tag of customerTags) {
    tagCounts.set(tag.name, (tagCounts.get(tag.name) ?? 0) + 1);
  }
  for (const profile of profiles) {
    for (const label of profileLabels(profile.tags)) {
      tagCounts.set(label, (tagCounts.get(label) ?? 0) + 1);
    }
  }

  const lifecycleCounts = new Map<string, number>();
  for (const profile of profiles) {
    lifecycleCounts.set(profile.lifecycle, (lifecycleCounts.get(profile.lifecycle) ?? 0) + 1);
  }

  return {
    summary: {
      totalCustomers: customers.length,
      monthNewCustomers: customers.filter((customer) => customer.createdAt >= monthStart).length,
      dau: activeToday.size,
      mau: activeMonth.size,
      aiChats30d: chats.length,
      issuedCoupons,
      usedCoupons,
      couponUseRate: issuedCoupons > 0 ? usedCoupons / issuedCoupons : 0,
      couponRevenue,
    },
    growth: Array.from({ length: 14 }, (_, index) => {
      const date = addDays(last14Start, index);
      const key = dayKey(date);
      return {
        label: dayLabel(date),
        newUsers: dailyNewUsers.get(key) ?? 0,
        activeUsers: dailyActive.get(key)?.size ?? 0,
      };
    }),
    tags: Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    lifecycle: ["NEW", "ACTIVE", "SILENT", "LOST"].map((name) => ({
      name,
      count: lifecycleCounts.get(name) ?? 0,
    })),
    coupons: coupons.slice(0, 8).map((coupon) => ({
      id: coupon.id,
      name: coupon.name,
      issued: coupon.issuedQuantity,
      used: coupon.usedQuantity,
      holders: coupon.holders.length,
      endsAt: coupon.endsAt.toISOString(),
      isActive: coupon.isActive,
    })),
  };
}
