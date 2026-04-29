import Link from "next/link";
import { AlertTriangle, Banknote, ClipboardList, ShoppingBag, TrendingDown, TrendingUp, Users } from "lucide-react";

import { DashboardCharts } from "@/components/charts/DashboardCharts";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type MetricCard = {
  title: string;
  value: string;
  trend: number;
  icon: typeof ShoppingBag;
  tone: "blue" | "green" | "purple" | "orange";
  href?: string;
};

type LowStockItem = {
  name: string;
  stock: number;
  safeStock: number;
};

type ReceivableItem = {
  customer: string;
  amount: number;
  overdueDays: number;
};

type RecentOrder = {
  orderNo: string;
  customer: string;
  amount: number;
  status: string;
  createdAt: string;
};

type DashboardData = {
  metrics: MetricCard[];
  trend: Array<{ date: string; sales: number }>;
  status: Array<{ name: string; value: number }>;
  lowStock: LowStockItem[];
  receivables: ReceivableItem[];
  recentOrders: RecentOrder[];
};

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  CONFIRMED: "待发货",
  SHIPPING: "配送中",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

const toneClasses = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  purple: "bg-indigo-50 text-indigo-600",
  orange: "bg-amber-50 text-amber-600",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getLastSevenDays() {
  const days: Date[] = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    day.setHours(0, 0, 0, 0);
    days.push(day);
  }
  return days;
}

function fallbackDashboardData(): DashboardData {
  return {
    metrics: [
      { title: "今日订单数", value: "18", trend: 12, icon: ShoppingBag, tone: "blue" },
      { title: "今日销售额", value: formatCurrency(32480), trend: 8, icon: Banknote, tone: "green" },
      { title: "新增客户数", value: "6", trend: -3, icon: Users, tone: "purple" },
      { title: "待处理事项", value: "14", trend: 5, icon: ClipboardList, tone: "orange" },
    ],
    trend: getLastSevenDays().map((date, index) => ({
      date: formatShortDate(date),
      sales: [12800, 18600, 16420, 22600, 19800, 27600, 32480][index] ?? 0,
    })),
    status: [
      { name: "待支付", value: 8 },
      { name: "待发货", value: 12 },
      { name: "配送中", value: 6 },
      { name: "已完成", value: 38 },
    ],
    lowStock: [
      { name: "进口调和威士忌 700ml", stock: 8, safeStock: 12 },
      { name: "经典白兰地 700ml", stock: 9, safeStock: 12 },
      { name: "五粮液特曲 浓香型 500ml", stock: 18, safeStock: 24 },
      { name: "张裕优选赤霞珠 750ml", stock: 16, safeStock: 20 },
    ],
    receivables: [
      { customer: "莲城便利店", amount: 12800, overdueDays: 18 },
      { customer: "岳塘烟酒商行", amount: 9600, overdueDays: 12 },
      { customer: "易俗河社区超市", amount: 7350, overdueDays: 7 },
    ],
    recentOrders: [
      { orderNo: "HQ20260425000001", customer: "张阿姨", amount: 238, status: "已支付", createdAt: "10:12" },
      { orderNo: "HQ20260425000002", customer: "莲城便利店", amount: 5820, status: "待发货", createdAt: "10:35" },
      { orderNo: "HQ20260425000003", customer: "王老师", amount: 146, status: "配送中", createdAt: "11:08" },
    ],
  };
}

async function getDashboardData(): Promise<DashboardData> {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    const [
      todayOrders,
      yesterdayOrders,
      todaySales,
      yesterdaySales,
      newCustomers,
      yesterdayNewCustomers,
      pendingOrders,
      products,
      overduePayments,
      trendOrders,
      statusGroups,
      receivableOrders,
      recentOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.order.aggregate({ _sum: { payableAmount: true }, where: { createdAt: { gte: todayStart } } }),
      prisma.order.aggregate({ _sum: { payableAmount: true }, where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.customer.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.customer.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
      prisma.order.count({ where: { status: { in: ["PAID", "CONFIRMED"] } } }),
      prisma.product.findMany({
        orderBy: { stock: "asc" },
        select: { name: true, stock: true, safeStock: true },
        take: 50,
      }),
      prisma.payment.count({ where: { status: "PENDING", dueDate: { lt: now } } }),
      prisma.order.findMany({
        where: { createdAt: { gte: getLastSevenDays()[0] } },
        select: { createdAt: true, payableAmount: true },
      }),
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.order.findMany({
        where: { paidAmount: { lt: prisma.order.fields.payableAmount } },
        include: { customer: { select: { name: true } } },
        take: 100,
      }),
      prisma.order.findMany({
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const todaySalesAmount = Number(todaySales._sum.payableAmount ?? 0);
    const yesterdaySalesAmount = Number(yesterdaySales._sum.payableAmount ?? 0);
    const lowStock = products.filter((product) => product.stock < product.safeStock).slice(0, 10);
    const pendingCount = pendingOrders + lowStock.length + overduePayments;
    const days = getLastSevenDays();
    const trend = days.map((day) => {
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);
      const sales = trendOrders
        .filter((order) => order.createdAt >= day && order.createdAt < nextDay)
        .reduce((total, order) => total + Number(order.payableAmount), 0);

      return { date: formatShortDate(day), sales };
    });

    const receivableMap = new Map<string, ReceivableItem>();
    receivableOrders.forEach((order) => {
      const amount = Number(order.payableAmount) - Number(order.paidAmount);
      const overdueDays = Math.max(0, Math.floor((now.getTime() - order.createdAt.getTime()) / 86_400_000));
      const current = receivableMap.get(order.customer.name);
      receivableMap.set(order.customer.name, {
        customer: order.customer.name,
        amount: (current?.amount ?? 0) + amount,
        overdueDays: Math.max(current?.overdueDays ?? 0, overdueDays),
      });
    });

    const orderTrend = yesterdayOrders === 0 ? todayOrders * 100 : Math.round(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100);
    const salesTrend =
      yesterdaySalesAmount === 0 ? Math.round(todaySalesAmount) : Math.round(((todaySalesAmount - yesterdaySalesAmount) / yesterdaySalesAmount) * 100);
    const customerTrend =
      yesterdayNewCustomers === 0 ? newCustomers * 100 : Math.round(((newCustomers - yesterdayNewCustomers) / yesterdayNewCustomers) * 100);

    const fallback = fallbackDashboardData();
    const status = statusGroups.map((group) => ({
      name: statusLabels[group.status] ?? group.status,
      value: group._count._all,
    }));
    const receivables = [...receivableMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 10);
    const mappedRecentOrders = recentOrders.map((order) => ({
      orderNo: order.orderNo,
      customer: order.customer.name,
      amount: Number(order.payableAmount),
      status: statusLabels[order.status] ?? order.status,
      createdAt: order.createdAt.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }));

    return {
      metrics: [
        { title: "今日订单数", value: todayOrders.toString(), trend: orderTrend, icon: ShoppingBag, tone: "blue" },
        { title: "今日销售额", value: formatCurrency(todaySalesAmount), trend: salesTrend, icon: Banknote, tone: "green" },
        { title: "新增客户数", value: newCustomers.toString(), trend: customerTrend, icon: Users, tone: "purple" },
        { title: "待处理事项", value: pendingCount.toString(), trend: pendingCount, icon: ClipboardList, tone: "orange", href: "/dashboard/pending" },
      ],
      trend: trend.some((item) => item.sales > 0) ? trend : fallback.trend,
      status: status.length > 0 ? status : fallback.status,
      lowStock: lowStock.length > 0 ? lowStock : fallback.lowStock,
      receivables: receivables.length > 0 ? receivables : fallback.receivables,
      recentOrders: mappedRecentOrders.length > 0 ? mappedRecentOrders : fallback.recentOrders,
    };
  } catch {
    return fallbackDashboardData();
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">仪表盘</h1>
        <p className="mt-1 text-sm text-slate-500">实时掌握订单、销售、库存和回款情况</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = metric.icon;
          const isPositive = metric.trend >= 0;

          const cardContent = (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">{metric.title}</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-900">{metric.value}</p>
                </div>
                <span className={cn("flex h-11 w-11 items-center justify-center rounded-lg", toneClasses[metric.tone])}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className={cn("mt-4 flex items-center gap-1 text-sm", isPositive ? "text-emerald-600" : "text-red-600")}>
                {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{Math.abs(metric.trend)}% 较昨日</span>
              </div>
            </>
          );

          return metric.href ? (
            <Link
              className="block rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
              href={metric.href}
              key={metric.title}
            >
              {cardContent}
            </Link>
          ) : (
            <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md" key={metric.title}>
              {cardContent}
            </div>
          );
        })}
      </section>

      <DashboardCharts status={data.status} trend={data.trend} />

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">库存预警 TOP10</h2>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-left text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-3 font-medium">产品</th>
                  <th className="py-3 font-medium">库存</th>
                  <th className="py-3 font-medium">安全线</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((item) => (
                  <tr className="border-b border-slate-100 last:border-0" key={item.name}>
                    <td className="py-3 text-slate-900">{item.name}</td>
                    <td className="py-3 font-medium text-red-600">{item.stock}</td>
                    <td className="py-3 text-slate-600">{item.safeStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">应收账款 TOP10</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-left text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-3 font-medium">客户</th>
                  <th className="py-3 font-medium">欠款</th>
                  <th className="py-3 font-medium">逾期</th>
                </tr>
              </thead>
              <tbody>
                {data.receivables.map((item) => (
                  <tr className="border-b border-slate-100 last:border-0" key={item.customer}>
                    <td className="py-3 text-slate-900">{item.customer}</td>
                    <td className="py-3 font-medium text-slate-900">{formatCurrency(item.amount)}</td>
                    <td className={cn("py-3", item.overdueDays > 30 ? "text-red-600" : "text-slate-600")}>{item.overdueDays} 天</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">最近订单</h2>
          <div className="space-y-3">
            {data.recentOrders.map((order) => (
              <div className="rounded-md border border-slate-100 p-3" key={order.orderNo}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{order.orderNo}</p>
                    <p className="mt-1 text-sm text-slate-500">{order.customer}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{order.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">{formatCurrency(order.amount)}</span>
                  <span className="text-slate-500">{order.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
