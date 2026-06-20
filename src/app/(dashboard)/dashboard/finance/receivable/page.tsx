import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AgingChart } from "@/features/finance/FinanceCharts";
import { getReceivableData } from "@/features/finance/queries";
import { formatCurrency } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

export default async function ReceivablePage() {
  const data = await getReceivableData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">应收账款</h1>
        <p className="mt-1 text-sm text-neutral-500">按客户汇总欠款，并进行账龄分桶</p>
      </div>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">账龄分析</h2>
        <div className="mt-4">
          <AgingChart data={data.aging} />
        </div>
      </section>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">待收订单</th>
                <th className="px-4 py-3 font-medium">总欠款</th>
                <th className="px-4 py-3 font-medium">最早逾期天数</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr className="dashboard-table-row" key={row.customerId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-950">{row.customerName}</p>
                    <p className="mt-1 text-xs text-neutral-500">{row.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{row.orderCount}</td>
                  <td className="px-4 py-3 font-semibold text-orange-700">{formatCurrency(row.totalDebt)}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.earliestAge} 天</td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/finance/payments?customerId=${row.customerId}`}>登记收款</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
