import { Clock, MapPin } from "lucide-react";

import { DealerOrderActions } from "@/features/dealer/DealerOrderActions";
import { formatDateTime } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

type DealerOrderCardProps = {
  order: {
    routingId: string;
    orderId: string;
    orderNo: string;
    status: string;
    statusLabel: string;
    amountText: string;
    distance: number;
    createdAt: string;
    address: string;
    customer: string;
    items: Array<{ name: string; quantity: number }>;
  };
  mode: "incoming" | "processing";
};

export function DealerOrderCard({ order, mode }: DealerOrderCardProps) {
  const isComplete = order.status === "COMPLETED" || order.status === "DELIVERED";
  const isRisk = order.status === "CANCELLED" || order.status === "REFUNDING" || order.status === "REFUNDED";

  return (
    <article className="dealer-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-950">{order.orderNo}</p>
          <p className="mt-1 text-sm text-neutral-500">{order.customer}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="dealer-money">{order.amountText}</p>
          <span className={cn("mt-1 dealer-status-badge", isComplete ? "dealer-status-success" : "", isRisk ? "dealer-status-risk" : "")}>{order.statusLabel}</span>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm text-neutral-600">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#b9472d]" />
          <span>{order.address} · {order.distance.toFixed(2)} km</span>
        </p>
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-neutral-400" />
          {formatDateTime(order.createdAt)}
        </p>
      </div>
      <div className="mt-3 rounded-md border border-[#f8d6c9] bg-[#fff1e8] px-3 py-2 text-sm text-neutral-600">
        {order.items.map((item) => `${item.name} x${item.quantity}`).join(" / ")}
      </div>
      <div className="mt-4">
        <DealerOrderActions mode={mode} orderId={order.orderId} routingId={order.routingId} status={order.status} />
      </div>
    </article>
  );
}
