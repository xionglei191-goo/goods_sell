"use client";

import type { OrderStatus } from "@prisma/client";
import { CheckCircle2, PackageCheck, Truck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateOrderStatus } from "@/features/orders/actions";

type OrderStatusActionsProps = {
  orderId: string;
  status: OrderStatus;
  allowedActions?: Array<"confirm" | "ship" | "deliver" | "complete" | "cancel">;
};

export function OrderStatusActions({ orderId, status, allowedActions }: OrderStatusActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const actions = [
    { key: "confirm", label: "确认", icon: CheckCircle2, show: status === "PENDING_PAYMENT" || status === "PAID" },
    { key: "ship", label: "发货", icon: Truck, show: status === "PAID" || status === "CONFIRMED" },
    { key: "complete", label: "完成", icon: PackageCheck, show: status === "SHIPPING" || status === "DELIVERED" },
    { key: "cancel", label: "取消", icon: XCircle, show: status === "PENDING_PAYMENT" || status === "PAID" || status === "CONFIRMED" },
  ] as const;
  const allowed = new Set(allowedActions ?? actions.map((action) => action.key));
  const visible = actions.filter((action) => action.show && allowed.has(action.key));

  function run(action: (typeof actions)[number]["key"]) {
    startTransition(async () => {
      const result = await updateOrderStatus({ orderId, action });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "操作成功");
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visible.map((action) => {
          const Icon = action.icon;
          return (
            <Button key={action.key} onClick={() => run(action.key)} size="sm" variant={action.key === "cancel" ? "outline" : "default"} disabled={isPending}>
              <Icon className="h-4 w-4" />
              {action.label}
            </Button>
          );
        })}
      </div>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
