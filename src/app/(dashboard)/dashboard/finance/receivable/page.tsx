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
        <h1 className="text-2xl font-semibold text-slate-900">应收账款</h1>
        <p className="mt-1 text-sm text-slate-500">按客户汇总欠款，并进行账龄分桶</p>
      </div>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">账龄分析</h2>
        <div className="mt-4">
          <AgingChart data={data.aging} />
        </div>
      </section>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
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
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={row.customerId}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{row.customerName}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.orderCount}</td>
                  <td className="px-4 py-3 font-semibold text-red-700">{formatCurrency(row.totalDebt)}</td>
                  <td className="px-4 py-3 text-slate-600">{row.earliestAge} 天</td>
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
