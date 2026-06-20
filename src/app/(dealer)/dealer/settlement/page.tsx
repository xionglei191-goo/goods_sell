import { getDealerSettlement } from "@/features/dealer/queries";
import { formatCurrency, formatDateTime } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

export default async function DealerSettlementPage() {
  const data = await getDealerSettlement();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-950">结算中心</h1>
        <p className="mt-1 text-sm text-neutral-500">本月已完成订单结算明细</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="dealer-card p-4 text-center">
          <p className="text-xl font-bold text-neutral-950">{data.completedCount}</p>
          <p className="mt-1 text-xs text-neutral-500">完成订单</p>
        </div>
        <div className="dealer-card p-4 text-center">
          <p className="text-xl dealer-money">{formatCurrency(data.totalAmount)}</p>
          <p className="mt-1 text-xs text-neutral-500">订单金额</p>
        </div>
        <div className="dealer-card p-4 text-center">
          <p className="text-xl metric-positive">{formatCurrency(data.settlementAmount)}</p>
          <p className="mt-1 text-xs text-neutral-500">结算金额</p>
        </div>
      </div>
      <div className="space-y-3">
        {data.orders.map((order) => (
          <article className="dealer-card p-4" key={order.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-950">{order.orderNo}</p>
                <p className="mt-1 text-xs text-neutral-500">{formatDateTime(order.completedAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="metric-positive">{formatCurrency(order.settlementAmount)}</p>
                <p className="text-xs text-neutral-500">按 90% 结算</p>
              </div>
            </div>
          </article>
        ))}
        {data.orders.length === 0 ? <div className="dealer-empty-state">本月暂无完成订单</div> : null}
      </div>
    </div>
  );
}
