import { Clock, MapPin } from "lucide-react";

import { DealerOrderActions } from "@/features/dealer/DealerOrderActions";
import { formatDateTime, orderStatusClasses } from "@/features/orders/utils";
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
  return (
    <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{order.orderNo}</p>
          <p className="mt-1 text-sm text-slate-500">{order.customer} · {order.amountText}</p>
        </div>
        <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[order.status as keyof typeof orderStatusClasses])}>{order.statusLabel}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#dc2626]" />
          {order.address} · {order.distance.toFixed(2)} km
        </p>
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          {formatDateTime(order.createdAt)}
        </p>
      </div>
      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {order.items.map((item) => `${item.name} x${item.quantity}`).join(" / ")}
      </div>
      <div className="mt-4">
        <DealerOrderActions mode={mode} orderId={order.orderId} routingId={order.routingId} status={order.status} />
      </div>
    </article>
  );
}
