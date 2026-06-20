import Link from "next/link";

import { SalesCharts } from "@/features/sales/SalesCharts";
import { getSalesReport } from "@/features/sales/queries";
import { formatCurrency } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SalesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const periodTabs = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
];

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const data = await getSalesReport(params);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">销售报表</h1>
          <p className="mt-1 text-sm text-neutral-500">销售趋势、产品排行、客户排行与销售员业绩</p>
        </div>
        <div className="flex rounded-md bg-[var(--dashboard-panel)] p-1 shadow-[var(--surface-raised-shadow)]" style={{ border: "1px solid var(--dashboard-line)" }}>
          {periodTabs.map((tab) => (
            <Link className={cn("rounded-md px-4 py-2 text-sm font-medium", data.period === tab.key ? "bg-orange-500 text-white" : "text-neutral-600 hover:bg-orange-50")} href={`/dashboard/sales?period=${tab.key}`} key={tab.key}>
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">销售额</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{formatCurrency(data.summary.totalSales)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">订单数</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{data.summary.orderCount}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">平均客单</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{formatCurrency(data.summary.avgOrderAmount)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">成交客户</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{data.summary.customerCount}</p>
        </div>
      </section>

      <SalesCharts topProducts={data.topProducts} trend={data.trend} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">客户销售额排名</h2>
          <div className="mt-4 space-y-3">
            {data.customerRanks.map((customer, index) => (
              <div className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2 text-sm" key={customer.name}>
                <span>{index + 1}. {customer.name} · {customer.orders} 单</span>
                <span className="font-semibold text-neutral-950">{formatCurrency(customer.sales)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">销售员业绩排名</h2>
          <div className="mt-4 space-y-3">
            {data.salespersonRanks.map((person, index) => (
              <div className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2 text-sm" key={person.name}>
                <span>{index + 1}. {person.name} · {person.orders} 单</span>
                <span className="font-semibold text-neutral-950">{formatCurrency(person.sales)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
