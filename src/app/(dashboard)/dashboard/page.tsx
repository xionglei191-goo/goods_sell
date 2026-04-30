import Link from "next/link";
import { AlertTriangle, Banknote, ClipboardList, MapPin, QrCode, ShoppingBag, Siren, Store, TrendingDown, TrendingUp, Users } from "lucide-react";

import { DashboardCharts } from "@/components/charts/DashboardCharts";
import { getCompanyOperationsData, type CompanyOperationsData } from "@/features/dashboard/company-operations";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type MetricCard = {
  title: string;
  value: string;
  trend: number;
  icon: typeof ShoppingBag;
  tone: CardTone;
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
  company: CompanyOperationsData;
  lowStock: LowStockItem[];
  receivables: ReceivableItem[];
  recentOrders: RecentOrder[];
};

type CardTone = "blue" | "green" | "purple" | "orange" | "red" | "slate";

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
  red: "bg-red-50 text-red-600",
  slate: "bg-slate-100 text-slate-600",
};

const dealerTierLabels: Record<string, string> = {
  ACTIVE: "活跃",
  STANDARD: "普通",
  TO_ACTIVATE: "待激活",
  RISK: "风险",
};

const customerSegmentLabels: Record<string, string> = {
  HIGH_VALUE_GROUP_BUY: "高价值团购",
  RESTAURANT: "餐饮店",
  TOBACCO_WINE_STORE: "烟酒店",
  BANQUET: "宴席客户",
  REGULAR: "普通消费者",
};

const conflictStatuses = ["OPEN", "PROCESSING", "RESOLVED", "IGNORED"] as const;

const conflictStatusLabels: Record<(typeof conflictStatuses)[number], string> = {
  OPEN: "待处理",
  PROCESSING: "处理中",
  RESOLVED: "已解决",
  IGNORED: "已忽略",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
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

function fallbackCompanyOperationsData(): CompanyOperationsData {
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (13 - index));
    return { label: formatShortDate(day), total: 0, OPEN: 0, PROCESSING: 0, RESOLVED: 0, IGNORED: 0 };
  });

  return {
    summary: {
      revenue30d: 0,
      orderCount30d: 0,
      zoneCount: 0,
      dealerCount: 0,
      activeDealerCount: 0,
      riskDealerCount: 0,
      customerCount: 0,
      leadCount30d: 0,
      salespersonScanCount: 0,
      salespersonLeadCount: 0,
      pushConversionRate: 0,
      openConflicts: 0,
    },
    zones: [],
    dealerTiers: { ACTIVE: 0, STANDARD: 0, TO_ACTIVATE: 0, RISK: 0 },
    customerSegments: [],
    salespeople: [],
    productPushes: [],
    conflictTrend: days,
  };
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
    company: fallbackCompanyOperationsData(),
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
      company,
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
      getCompanyOperationsData(),
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
      company,
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
  const maxZoneRevenue = Math.max(1, ...data.company.zones.map((zone) => zone.revenue));
  const maxConflictTotal = Math.max(1, ...data.company.conflictTrend.map((item) => item.total));

  return (
    <div className="min-w-0 space-y-6">
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

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <OperationCard href="/dashboard/orders" icon={Banknote} label="30天销售额" tone="green" value={formatCurrency(data.company.summary.revenue30d)} helper={`${data.company.summary.orderCount30d} 单成交`} />
        <OperationCard href="/dashboard/map" icon={MapPin} label="覆盖区域" tone="blue" value={String(data.company.summary.zoneCount)} helper="按订单、经销商和线索汇总" />
        <OperationCard
          href="/dashboard/dealers"
          icon={Store}
          label="经销商承接"
          tone="purple"
          value={`${data.company.summary.activeDealerCount}/${data.company.summary.dealerCount}`}
          helper={`风险 ${data.company.summary.riskDealerCount} 家`}
        />
        <OperationCard href="/dashboard/customers" icon={Users} label="客户资产" tone="slate" value={String(data.company.summary.customerCount)} helper={`近30天线索 ${data.company.summary.leadCount30d}`} />
        <OperationCard
          href="/dashboard/promoters"
          icon={QrCode}
          label="业务员地推"
          tone="orange"
          value={`${data.company.summary.salespersonScanCount}/${data.company.summary.salespersonLeadCount}`}
          helper="扫码 / 线索"
        />
        <OperationCard href="/dashboard/channel-conflicts" icon={Siren} label="渠道冲突" tone="red" value={String(data.company.summary.openConflicts)} helper="待处理/处理中" />
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">区域经营排行</h2>
              <p className="mt-1 text-sm text-slate-500">近30天按区域聚合订单、经销商、线索和冲突</p>
            </div>
            <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/dashboard/map">
              地图
            </Link>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-3 font-medium">区域</th>
                  <th className="py-3 font-medium">销售额</th>
                  <th className="py-3 font-medium">订单</th>
                  <th className="py-3 font-medium">经销商</th>
                  <th className="py-3 font-medium">线索</th>
                  <th className="py-3 font-medium">冲突</th>
                </tr>
              </thead>
              <tbody>
                {data.company.zones.map((zone) => (
                  <tr className="border-b border-slate-100 last:border-0" key={zone.zone}>
                    <td className="py-3">
                      <p className="font-medium text-slate-900">{zone.zone}</p>
                      <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(6, (zone.revenue / maxZoneRevenue) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-3 font-medium text-slate-900">{formatCurrency(zone.revenue)}</td>
                    <td className="py-3 text-slate-600">{zone.orderCount}</td>
                    <td className="py-3 text-slate-600">{zone.activeDealerCount}/{zone.dealerCount}</td>
                    <td className="py-3 text-slate-600">{zone.leadCount}</td>
                    <td className={cn("py-3", zone.openConflictCount > 0 ? "font-medium text-red-600" : "text-slate-500")}>{zone.openConflictCount}</td>
                  </tr>
                ))}
                {data.company.zones.length === 0 ? (
                  <tr>
                    <td className="py-8 text-center text-slate-500" colSpan={6}>
                      暂无区域经营数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">渠道资产概览</h2>
              <p className="mt-1 text-sm text-slate-500">经销商分层与客户类型结构</p>
            </div>
            <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/dashboard/dealers">
              经销商
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(data.company.dealerTiers).map(([tier, count]) => (
              <div className="rounded-md border border-slate-100 px-3 py-2" key={tier}>
                <p className="text-xs text-slate-500">{dealerTierLabels[tier] ?? tier}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{count}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {data.company.customerSegments.map((segment) => (
              <div className="flex items-center justify-between gap-3 text-sm" key={segment.segment}>
                <div>
                  <p className="font-medium text-slate-900">{customerSegmentLabels[segment.segment] ?? segment.segment}</p>
                  <p className="text-xs text-slate-500">{segment.count} 个客户</p>
                </div>
                <p className="font-medium text-slate-900">{formatCurrency(segment.revenue)}</p>
              </div>
            ))}
            {data.company.customerSegments.length === 0 ? <p className="text-sm text-slate-500">暂无客户类型数据</p> : null}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">业务员地推效果</h2>
            <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/dashboard/salespeople">
              绩效
            </Link>
          </div>
          <div className="space-y-3">
            {data.company.salespeople.map((person) => (
              <div className="rounded-md border border-slate-100 p-3" key={person.name}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{person.name}</p>
                    <p className="mt-1 text-xs text-slate-500">绑定经销商 {person.dealerCount}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">扫码 {person.scans}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">线索 {person.leads} · 订单 {person.orders}</p>
              </div>
            ))}
            {data.company.salespeople.length === 0 ? <p className="text-sm text-slate-500">暂无业务员地推数据</p> : null}
          </div>
        </div>

        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">新品推送复盘</h2>
            <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/dashboard/product-pushes">
              推送
            </Link>
          </div>
          <div className="space-y-3">
            {data.company.productPushes.map((push) => (
              <div className="rounded-md border border-slate-100 p-3" key={`${push.productName}-${push.targetTag}`}>
                <p className="truncate font-medium text-slate-900">{push.productName}</p>
                <p className="mt-1 text-xs text-slate-500">{push.targetTag}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-600">打开 {formatPercent(push.openRate)}</span>
                  <span className="font-medium text-emerald-700">转化 {formatPercent(push.conversionRate)}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{push.nextAction}</p>
              </div>
            ))}
            {data.company.productPushes.length === 0 ? <p className="text-sm text-slate-500">暂无新品推送数据</p> : null}
          </div>
        </div>

        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">渠道冲突趋势</h2>
            <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/dashboard/channel-conflicts">
              台账
            </Link>
          </div>
          <div className="space-y-2">
            {data.company.conflictTrend.map((item) => (
              <div className="grid grid-cols-[44px_1fr_32px] items-center gap-2 text-xs" key={item.label}>
                <span className="text-slate-500">{item.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(item.total > 0 ? 8 : 0, (item.total / maxConflictTotal) * 100)}%` }} />
                </div>
                <span className={cn("text-right", item.total > 0 ? "font-medium text-red-600" : "text-slate-400")}>{item.total}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
            {conflictStatuses.map((status) => (
              <div className="rounded-md bg-slate-50 px-2 py-2" key={status}>
                <p className="text-slate-500">{conflictStatusLabels[status]}</p>
                <p className="mt-1 font-semibold text-slate-900">{data.company.conflictTrend.reduce((sum, item) => sum + item[status], 0)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">库存预警 TOP10</h2>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div className="max-w-full overflow-x-auto">
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

        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">应收账款 TOP10</h2>
          <div className="max-w-full overflow-x-auto">
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

        <div className="min-w-0 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
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

function OperationCard({
  href,
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  href: string;
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  helper: string;
  tone: CardTone;
}) {
  return (
    <Link className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 truncate text-xs text-slate-500">{helper}</p>
    </Link>
  );
}
