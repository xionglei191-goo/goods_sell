import { getDealerSettlement } from "@/features/dealer/queries";
import { formatCurrency, formatDateTime } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

export default async function DealerSettlementPage() {
  const data = await getDealerSettlement();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">结算中心</h1>
        <p className="mt-1 text-sm text-slate-500">本月已完成订单结算明细</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-xl font-bold text-slate-900">{data.completedCount}</p>
          <p className="mt-1 text-xs text-slate-500">完成订单</p>
        </div>
        <div className="rounded-lg bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-xl font-bold text-slate-900">{formatCurrency(data.totalAmount)}</p>
          <p className="mt-1 text-xs text-slate-500">订单金额</p>
        </div>
        <div className="rounded-lg bg-white p-4 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-xl font-bold text-[#dc2626]">{formatCurrency(data.settlementAmount)}</p>
          <p className="mt-1 text-xs text-slate-500">结算金额</p>
        </div>
      </div>
      <div className="space-y-3">
        {data.orders.map((order) => (
          <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200" key={order.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{order.orderNo}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(order.completedAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">{formatCurrency(order.settlementAmount)}</p>
                <p className="text-xs text-slate-500">按 90% 结算</p>
              </div>
            </div>
          </article>
        ))}
        {data.orders.length === 0 ? <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">本月暂无完成订单</div> : null}
      </div>
    </div>
  );
}
