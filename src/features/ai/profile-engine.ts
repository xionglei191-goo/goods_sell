import type { FrequencyLevel, LeadScene, Lifecycle, Prisma, SpendingLevel } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function monthsBetween(from: Date, to = new Date()) {
  return Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type CategoryWithParent = {
  name: string;
  parent: CategoryWithParent | null;
};

function rootCategoryName(category: CategoryWithParent) {
  let current: CategoryWithParent = category;
  while (current.parent) current = current.parent;
  return current.name;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : null;
}

function collectJsonText(value: Prisma.JsonValue | null | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => collectJsonText(item)).join(" ");
  const object = jsonObject(value);
  return object ? Object.values(object).map((item) => collectJsonText(item)).join(" ") : "";
}

const businessTagColors: Record<string, string> = {
  "画像:宴席客户": "#fee2e2",
  "画像:企业团购": "#dbeafe",
  "画像:餐饮采购": "#dcfce7",
  "画像:烟酒店补货": "#fef3c7",
  "画像:普通散客": "#f1f5f9",
  "画像:潜在经销商": "#ede9fe",
};

function addSceneCount(sceneCounts: Map<LeadScene, number>, scene: LeadScene) {
  sceneCounts.set(scene, (sceneCounts.get(scene) ?? 0) + 1);
}

export async function analyzeCustomerProfile(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      dealer: true,
      leads: {
        select: { scene: true, source: true, metadata: true, notes: true },
      },
      inquiries: {
        select: { scene: true, content: true, notes: true },
      },
      orders: {
        where: { parentId: null, status: { in: ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"] } },
        include: {
          items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!customer) {
    throw new Error("客户不存在");
  }

  const now = new Date();
  const totalAmount = customer.orders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
  const monthCount = monthsBetween(customer.createdAt, now);
  const monthlyAverage = totalAmount / monthCount;
  const spendingLevel: SpendingLevel = monthlyAverage > 500 ? "HIGH" : monthlyAverage >= 100 ? "MEDIUM" : "LOW";
  const purchaseFrequencyValue = customer.orders.length / monthCount;
  const purchaseFrequency: FrequencyLevel = purchaseFrequencyValue >= 4 ? "HIGH" : purchaseFrequencyValue >= 1 ? "MEDIUM" : "LOW";
  const latestOrder = customer.orders.at(-1);
  const daysSinceLastOrder = latestOrder ? Math.floor((now.getTime() - latestOrder.createdAt.getTime()) / 86400000) : null;
  const daysSinceRegister = Math.floor((now.getTime() - customer.createdAt.getTime()) / 86400000);
  const lifecycle: Lifecycle = daysSinceRegister < 30 ? "NEW" : daysSinceLastOrder === null || daysSinceLastOrder > 90 ? "LOST" : daysSinceLastOrder > 30 ? "SILENT" : "ACTIVE";

  const categoryAmount = new Map<string, number>();
  const productAmount = new Map<string, { name: string; amount: number; quantity: number }>();
  const trendMap = new Map<string, number>();
  const sceneCounts = new Map<LeadScene, number>();
  for (const order of customer.orders) {
    const key = monthKey(order.createdAt);
    trendMap.set(key, (trendMap.get(key) ?? 0) + Number(order.payableAmount));
    if (order.type === "GROUP_BUY") addSceneCount(sceneCounts, "GROUP_BUY");
    if (order.type === "WHOLESALE") addSceneCount(sceneCounts, "RESTOCK");
    for (const item of order.items) {
      const categoryName = rootCategoryName(item.product.category as CategoryWithParent);
      categoryAmount.set(categoryName, (categoryAmount.get(categoryName) ?? 0) + Number(item.totalAmount));
      const current = productAmount.get(item.productId) ?? { name: item.productName, amount: 0, quantity: 0 };
      current.amount += Number(item.totalAmount);
      current.quantity += item.quantity;
      productAmount.set(item.productId, current);
    }
  }
  for (const lead of customer.leads) addSceneCount(sceneCounts, lead.scene);
  for (const inquiry of customer.inquiries) addSceneCount(sceneCounts, inquiry.scene);

  const restockText = [
    ...customer.leads.filter((lead) => lead.scene === "RESTOCK").map((lead) => `${collectJsonText(lead.metadata)} ${lead.notes ?? ""}`),
    ...customer.inquiries.filter((inquiry) => inquiry.scene === "RESTOCK").map((inquiry) => `${collectJsonText(inquiry.content)} ${inquiry.notes ?? ""}`),
  ].join(" ");
  const businessLabels = new Set<string>();
  if ((sceneCounts.get("BANQUET") ?? 0) > 0) businessLabels.add("画像:宴席客户");
  if ((sceneCounts.get("GROUP_BUY") ?? 0) > 0) businessLabels.add("画像:企业团购");
  if ((sceneCounts.get("RESTOCK") ?? 0) > 0) {
    if (/餐饮|餐馆|餐厅|饭店|烧烤|夜宵|酒店/.test(restockText)) {
      businessLabels.add("画像:餐饮采购");
    }
    if (/烟酒店|烟酒|酒水|便利店|小超市|超市|门店|零售/.test(restockText) || !businessLabels.has("画像:餐饮采购")) {
      businessLabels.add("画像:烟酒店补货");
    }
  }
  if ((sceneCounts.get("DEALER_JOIN") ?? 0) > 0 || customer.type === "DEALER" || customer.dealer) {
    businessLabels.add("画像:潜在经销商");
  }
  if (businessLabels.size === 0) {
    businessLabels.add("画像:普通散客");
  }

  const preferredCategories = Array.from(categoryAmount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  const tags = [
    `消费能力:${spendingLevel}`,
    `购买频次:${purchaseFrequency}`,
    `生命周期:${lifecycle}`,
    ...Array.from(businessLabels),
    ...preferredCategories.map((category) => `偏好:${category}`),
  ];
  const topProducts = Array.from(productAmount.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = monthKey(date);
    return { month: key, amount: trendMap.get(key) ?? 0 };
  });

  const businessSegments = Array.from(businessLabels);
  const sceneStats = Object.fromEntries(Array.from(sceneCounts.entries()));
  const profileTags = { labels: tags, businessSegments, sceneStats, monthlyAverage, orderCount: customer.orders.length, trend, topProducts };

  await prisma.$transaction([
    prisma.userProfile.upsert({
      where: { customerId },
      update: {
        spendingLevel,
        preferredCategories,
        purchaseFrequency,
        lifecycle,
        tags: profileTags,
        lastAnalyzedAt: now,
      },
      create: {
        customerId,
        spendingLevel,
        preferredCategories,
        purchaseFrequency,
        lifecycle,
        tags: profileTags,
        lastAnalyzedAt: now,
      },
    }),
    prisma.customerTag.deleteMany({ where: { customerId, source: "AI_PROFILE", name: { startsWith: "画像:" } } }),
    prisma.customerTag.createMany({
      data: businessSegments.map((name) => ({
        customerId,
        name,
        color: businessTagColors[name] ?? "#f1f5f9",
        source: "AI_PROFILE",
      })),
      skipDuplicates: true,
    }),
  ]);

  return { spendingLevel, purchaseFrequency, lifecycle, preferredCategories, tags, businessSegments, sceneStats, trend, topProducts };
}

export async function analyzeAllCustomerProfiles() {
  const customers = await prisma.customer.findMany({ select: { id: true } });
  const results = [];
  for (const customer of customers) {
    results.push(await analyzeCustomerProfile(customer.id));
  }
  return results.length;
}
