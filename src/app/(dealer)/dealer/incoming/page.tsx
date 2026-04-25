import { DealerOrderCard } from "@/features/dealer/DealerOrderCard";
import { getIncomingOrders } from "@/features/dealer/queries";

export const dynamic = "force-dynamic";

export default async function DealerIncomingPage() {
  const orders = await getIncomingOrders();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">待接订单</h1>
        <p className="mt-1 text-sm text-slate-500">接单后进入订单处理，拒单会自动重匹配下一位经销商</p>
      </div>
      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <DealerOrderCard key={order.routingId} mode="incoming" order={order} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">暂无待接订单</div>
      )}
    </div>
  );
}
