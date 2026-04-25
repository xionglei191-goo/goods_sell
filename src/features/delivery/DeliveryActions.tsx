"use client";

import { PackageCheck, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { markOrderDelivered, markOrderShipped } from "@/features/delivery/actions";

export function DeliveryActions({ orderId, status, initialTrackingNo }: { orderId: string; status: string; initialTrackingNo?: string | null }) {
  const router = useRouter();
  const [trackingNo, setTrackingNo] = useState(initialTrackingNo ?? `HQKD${Date.now().toString().slice(-8)}`);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function ship() {
    startTransition(async () => {
      const result = await markOrderShipped({ orderId, trackingNo });
      setMessage(result.success ? result.message ?? "已发货" : result.error.message);
      if (result.success) router.refresh();
    });
  }

  function deliver() {
    startTransition(async () => {
      const result = await markOrderDelivered({ orderId });
      setMessage(result.success ? result.message ?? "已送达" : result.error.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {status === "PAID" || status === "CONFIRMED" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-44 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-red-300"
            onChange={(event) => setTrackingNo(event.target.value)}
            placeholder="物流单号"
            value={trackingNo}
          />
          <Button disabled={isPending} onClick={ship} size="sm" type="button">
            <Truck className="h-4 w-4" />
            发货
          </Button>
        </div>
      ) : null}
      {status === "SHIPPING" ? (
        <Button disabled={isPending} onClick={deliver} size="sm" type="button" variant="outline">
          <PackageCheck className="h-4 w-4" />
          确认送达
        </Button>
      ) : null}
      {message ? <p className={message.includes("失败") || message.includes("不可") ? "text-xs text-red-600" : "text-xs text-slate-500"}>{message}</p> : null}
    </div>
  );
}
