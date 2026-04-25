import type { FrequencyLevel, Lifecycle, SpendingLevel } from "@prisma/client";

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

export async function analyzeCustomerProfile(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
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
  for (const order of customer.orders) {
    const key = monthKey(order.createdAt);
    trendMap.set(key, (trendMap.get(key) ?? 0) + Number(order.payableAmount));
    for (const item of order.items) {
      const categoryName = rootCategoryName(item.product.category as CategoryWithParent);
      categoryAmount.set(categoryName, (categoryAmount.get(categoryName) ?? 0) + Number(item.totalAmount));
      const current = productAmount.get(item.productId) ?? { name: item.productName, amount: 0, quantity: 0 };
      current.amount += Number(item.totalAmount);
      current.quantity += item.quantity;
      productAmount.set(item.productId, current);
    }
  }

  const preferredCategories = Array.from(categoryAmount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  const tags = [
    `消费能力:${spendingLevel}`,
    `购买频次:${purchaseFrequency}`,
    `生命周期:${lifecycle}`,
    ...preferredCategories.map((category) => `偏好:${category}`),
  ];
  const topProducts = Array.from(productAmount.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = monthKey(date);
    return { month: key, amount: trendMap.get(key) ?? 0 };
  });

  await prisma.userProfile.upsert({
    where: { customerId },
    update: {
      spendingLevel,
      preferredCategories,
      purchaseFrequency,
      lifecycle,
      tags: { labels: tags, monthlyAverage, orderCount: customer.orders.length, trend, topProducts },
      lastAnalyzedAt: now,
    },
    create: {
      customerId,
      spendingLevel,
      preferredCategories,
      purchaseFrequency,
      lifecycle,
      tags: { labels: tags, monthlyAverage, orderCount: customer.orders.length, trend, topProducts },
      lastAnalyzedAt: now,
    },
  });

  return { spendingLevel, purchaseFrequency, lifecycle, preferredCategories, tags, trend, topProducts };
}

export async function analyzeAllCustomerProfiles() {
  const customers = await prisma.customer.findMany({ select: { id: true } });
  const results = [];
  for (const customer of customers) {
    results.push(await analyzeCustomerProfile(customer.id));
  }
  return results.length;
}
