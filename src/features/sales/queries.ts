import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

type Period = "day" | "week" | "month";

function normalizePeriod(value: string): Period {
  return value === "week" || value === "month" ? value : "day";
}

function getPeriodStart(period: Period) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "day") start.setDate(start.getDate() - 6);
  if (period === "week") start.setDate(start.getDate() - 7 * 7);
  if (period === "month") start.setMonth(start.getMonth() - 11, 1);
  return start;
}

function trendKey(date: Date, period: Period) {
  if (period === "day") {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  if (period === "week") {
    const first = new Date(date);
    const day = first.getDay() || 7;
    first.setDate(first.getDate() - day + 1);
    return `${first.getMonth() + 1}/${first.getDate()}周`;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildTrendBuckets(period: Period) {
  const now = new Date();
  const buckets: Array<{ label: string; sales: number; orders: number }> = [];
  const count = period === "day" ? 7 : period === "week" ? 8 : 12;

  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    if (period === "day") date.setDate(now.getDate() - i);
    if (period === "week") date.setDate(now.getDate() - i * 7);
    if (period === "month") date.setMonth(now.getMonth() - i, 1);
    buckets.push({ label: trendKey(date, period), sales: 0, orders: 0 });
  }

  return buckets;
}

export async function getSalesReport(searchParams: SearchParams) {
  const period = normalizePeriod(firstParam(searchParams.period));
  const start = getPeriodStart(period);
  const trend = buildTrendBuckets(period);
  try {
    const orders = await prisma.order.findMany({
      where: {
        parentId: null,
        status: { in: ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"] },
        createdAt: { gte: start },
      },
      include: {
        customer: { include: { salesPerson: { select: { id: true, name: true } } } },
        salesPerson: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: "asc" },
    });

  const trendMap = new Map(trend.map((bucket) => [bucket.label, bucket]));
  const productMap = new Map<string, { name: string; sales: number; quantity: number }>();
  const customerMap = new Map<string, { name: string; sales: number; orders: number }>();
  const salespersonMap = new Map<string, { name: string; sales: number; orders: number }>();

  for (const order of orders) {
    const amount = Number(order.payableAmount);
    const key = trendKey(order.createdAt, period);
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.sales += amount;
      bucket.orders += 1;
    }

    const customerCurrent = customerMap.get(order.customerId) ?? { name: order.customer.name, sales: 0, orders: 0 };
    customerCurrent.sales += amount;
    customerCurrent.orders += 1;
    customerMap.set(order.customerId, customerCurrent);

    const salespersonName = order.salesPerson?.name ?? order.customer.salesPerson?.name ?? "未分配";
    const salespersonKey = order.salesPerson?.id ?? order.customer.salesPerson?.id ?? "unassigned";
    const salespersonCurrent = salespersonMap.get(salespersonKey) ?? { name: salespersonName, sales: 0, orders: 0 };
    salespersonCurrent.sales += amount;
    salespersonCurrent.orders += 1;
    salespersonMap.set(salespersonKey, salespersonCurrent);

    for (const item of order.items) {
      const productCurrent = productMap.get(item.productId) ?? { name: item.productName, sales: 0, quantity: 0 };
      productCurrent.sales += Number(item.totalAmount);
      productCurrent.quantity += item.quantity;
      productMap.set(item.productId, productCurrent);
    }
  }

  const totalSales = orders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
  return {
    period,
    summary: {
      totalSales,
      orderCount: orders.length,
      avgOrderAmount: orders.length > 0 ? totalSales / orders.length : 0,
      customerCount: customerMap.size,
    },
    trend,
    topProducts: Array.from(productMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10),
    customerRanks: Array.from(customerMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10),
    salespersonRanks: Array.from(salespersonMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10),
  };
  } catch (error) {
    return {
      period,
      summary: {
        totalSales: 0,
        orderCount: 0,
        avgOrderAmount: 0,
        customerCount: 0,
      },
      trend,
      topProducts: [],
      customerRanks: [],
      salespersonRanks: [],
      error: error instanceof Error ? error.message : "销售报表查询失败",
    };
  }
}
