import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DeliveryActions } from "@/features/delivery/DeliveryActions";
import { formatDateTime, getDeliveryDetail } from "@/features/delivery/queries";
import { orderStatusClasses, orderStatusLabels } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DeliveryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeliveryDetailPage({ params }: DeliveryDetailPageProps) {
  const { id } = await params;
  const detail = await getDeliveryDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">配送详情 {detail.orderNo}</h1>
          <p className="mt-1 text-sm text-neutral-500">{detail.customerName} · {detail.customerPhone}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/delivery">返回配送列表</Link>
        </Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="surface-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold text-neutral-950">订单信息</h2>
            <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[detail.status])}>{orderStatusLabels[detail.status]}</span>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="收货人" value={detail.receiver} />
            <Info label="收货地址" value={detail.address} />
            <Info label="物流方式" value={detail.delivery?.method ?? "待发货"} />
            <Info label="物流单号" value={detail.delivery?.trackingNo ?? "-"} />
          </div>
          <div className="mt-5">
            <DeliveryActions initialTrackingNo={detail.delivery?.trackingNo} orderId={detail.id} status={detail.status} />
          </div>
        </div>

        <div className="surface-panel p-5">
          <h2 className="font-semibold text-neutral-950">配送时间线</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Timeline label="已发货" value={formatDateTime(detail.delivery?.shippedAt)} />
            <Timeline label="已送达" value={formatDateTime(detail.delivery?.deliveredAt)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="surface-panel p-5">
          <h2 className="font-semibold text-neutral-950">商品明细</h2>
          <div className="mt-4 divide-y divide-neutral-100">
            {detail.items.map((item) => (
              <div className="flex items-center justify-between gap-4 py-3 text-sm" key={item.id}>
                <div>
                  <p className="font-medium text-neutral-950">{item.productName}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.sku}</p>
                </div>
                <p className="font-semibold text-neutral-950">x{item.quantity}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel p-5">
          <h2 className="font-semibold text-neutral-950">分单路由记录</h2>
          <div className="mt-4 space-y-3">
            {detail.routings.map((routing) => (
              <div className="rounded-md border p-3 text-sm" key={routing.id} style={{ borderColor: "var(--dashboard-line)" }}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-neutral-950">{routing.dealerName}</p>
                  <span className="text-xs text-neutral-500">{routing.status}</span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">{routing.distance.toFixed(2)} 米 · {formatDateTime(routing.assignedAt)}</p>
              </div>
            ))}
            {detail.routings.length === 0 ? <p className="text-sm text-neutral-500">总仓配送，无经销商分单记录。</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-medium text-neutral-950">{value}</p>
    </div>
  );
}

function Timeline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2">
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium text-neutral-950">{value}</span>
    </div>
  );
}
