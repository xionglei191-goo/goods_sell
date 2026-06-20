import { DealerOrderCard } from "@/features/dealer/DealerOrderCard";
import { getDealerOrders } from "@/features/dealer/queries";

export const dynamic = "force-dynamic";

export default async function DealerMyOrdersPage() {
  const orders = await getDealerOrders();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-950">订单处理</h1>
        <p className="mt-1 text-sm text-neutral-500">已接订单可确认发货或完成配送</p>
      </div>
      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <DealerOrderCard key={order.routingId} mode="processing" order={order} />
          ))}
        </div>
      ) : (
        <div className="dealer-empty-state">暂无已接订单</div>
      )}
    </div>
  );
}
