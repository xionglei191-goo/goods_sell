import Link from "next/link";

import { Button } from "@/components/ui/button";
import { OrderActionButtons } from "@/features/shop/OrderActionButtons";
import { ProductArt } from "@/features/shop/ProductArt";
import { getOrders } from "@/features/shop/queries";
import { formatCurrency, formatDateTime, orderStatusClasses } from "@/features/shop/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type OrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const tabs = [
  { key: "all", label: "全部" },
  { key: "pay", label: "待支付" },
  { key: "ship", label: "待发货" },
  { key: "delivery", label: "配送中" },
  { key: "completed", label: "已完成" },
];

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const active = status ?? "all";
  const orders = await getOrders(active === "all" ? undefined : active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-950">我的订单</h1>
        <p className="mt-1 text-sm text-stone-500">按状态查看订单进度</p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((tab) => (
          <Link className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium", active === tab.key ? "bg-[#dc2626] text-white" : "bg-white text-stone-600 ring-1 ring-stone-200")} href={tab.key === "all" ? "/shop/my-orders" : `/shop/my-orders?status=${tab.key}`} key={tab.key}>
            {tab.label}
          </Link>
        ))}
      </div>

      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order) => (
            <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200" key={order.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
                <div>
                  <p className="font-semibold text-stone-950">{order.orderNo}</p>
                  <p className="mt-1 text-xs text-stone-500">{formatDateTime(order.createdAt)}</p>
                </div>
                <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[order.status])}>{order.statusLabel}</span>
              </div>
              <div className="mt-3 flex gap-2 overflow-hidden">
                {order.items.map((item) => (
                  <div className="flex min-w-0 flex-1 items-center gap-2" key={item.id}>
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md">
                      <ProductArt categoryName="default" className="h-full w-full" name={item.name} />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium text-stone-800">{item.name}</p>
                      <p className="text-xs text-stone-400">x{item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-stone-500">
                  实付 <span className="text-lg font-bold text-[#dc2626]">{formatCurrency(order.payableAmount)}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/shop/my-orders/${order.id}`}>详情</Link>
                  </Button>
                  <OrderActionButtons orderId={order.id} status={order.status} />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-white px-4 py-14 text-center shadow-sm ring-1 ring-stone-200">
          <p className="font-semibold text-stone-950">暂无订单</p>
          <Button asChild className="mt-5 bg-[#dc2626] text-white hover:bg-[#b91c1c]">
            <Link href="/shop">去逛逛</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
