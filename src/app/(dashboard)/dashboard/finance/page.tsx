import Link from "next/link";

import { IncomeTrendChart } from "@/features/finance/FinanceCharts";
import { getFinanceOverview } from "@/features/finance/queries";
import { formatCurrency } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const data = await getFinanceOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">财务总览</h1>
        <p className="mt-1 text-sm text-neutral-500">应收、应付、收入趋势与利润分析</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Link className="surface-panel p-4" href="/dashboard/finance/receivable">
          <p className="text-sm text-neutral-500">应收总额</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{formatCurrency(data.summary.receivable)}</p>
        </Link>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">应付总额</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{formatCurrency(data.summary.payable)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">本月收入</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(data.summary.monthIncome)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">毛利润</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{formatCurrency(data.summary.profit)}</p>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">近 30 天收入趋势</h2>
        <div className="mt-4">
          <IncomeTrendChart data={data.trend} />
        </div>
      </section>
    </div>
  );
}
