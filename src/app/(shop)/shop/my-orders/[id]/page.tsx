import Link from "next/link";

import { Button } from "@/components/ui/button";
import { OrderActionButtons } from "@/features/shop/OrderActionButtons";
import { getOrderDetail } from "@/features/shop/queries";
import { formatCurrency, formatDateTime, orderStatusClasses, payMethodLabels } from "@/features/shop/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const order = await getOrderDetail(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-950">订单详情</h1>
          <p className="mt-1 font-mono text-sm text-neutral-500">{order.orderNo}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", orderStatusClasses[order.status])}>{order.statusLabel}</span>
      </div>

      <section className="shop-block-card p-4">
        <h2 className="font-bold text-neutral-950">商品明细</h2>
        <div className="mt-3 divide-y divide-neutral-100">
          {order.items.map((item) => (
            <div className="flex items-center justify-between gap-3 py-3" key={item.id}>
              <div className="min-w-0">
                <p className="line-clamp-1 font-medium text-neutral-950">{item.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{item.sku} · x{item.quantity}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-neutral-950">{formatCurrency(item.totalAmount)}</p>
                <p className="text-xs text-neutral-400">{formatCurrency(item.unitPrice)}/件</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="shop-block-card p-4">
          <h2 className="font-bold text-neutral-950">收货信息</h2>
          <p className="mt-3 text-sm text-neutral-600">{order.address.name} {order.address.phone}</p>
          <p className="mt-1 text-sm text-neutral-600">{order.address.province}{order.address.city}{order.address.district}{order.address.detail}</p>
        </div>
        <div className="shop-block-card p-4">
          <h2 className="font-bold text-neutral-950">金额信息</h2>
          <div className="mt-3 space-y-2 text-sm text-neutral-600">
            <div className="flex justify-between">
              <span>商品金额</span>
              <span>{formatCurrency(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>优惠金额</span>
              <span>{formatCurrency(order.discountAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>支付方式</span>
              <span>{order.payMethod ? payMethodLabels[order.payMethod] : "未支付"}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2 font-semibold text-neutral-950">
              <span>实付</span>
              <span className="commerce-accent">{formatCurrency(order.payableAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="shop-block-card p-4">
        <h2 className="font-bold text-neutral-950">订单时间线</h2>
        <div className="mt-3 space-y-3">
          {order.timeline.map((item) => (
            <div className="flex gap-3 text-sm" key={`${item.label}-${item.at}`}>
              <span className="mt-1 h-2 w-2 rounded-full bg-[#dc2626]" />
              <div>
                <p className="font-medium text-neutral-950">{item.label}</p>
                <p className="text-neutral-500">{formatDateTime(item.at)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/shop/my-orders">返回订单</Link>
        </Button>
        <OrderActionButtons orderId={order.id} status={order.status} />
      </div>
    </div>
  );
}
