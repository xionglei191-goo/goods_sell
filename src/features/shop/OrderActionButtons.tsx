"use client";

import type { OrderStatus } from "@prisma/client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cancelOrder, confirmOrder } from "@/features/shop/actions";

type OrderActionButtonsProps = {
  orderId: string;
  status: OrderStatus;
};

export function OrderActionButtons({ orderId, status }: OrderActionButtonsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canCancel = status === "PENDING_PAYMENT" || status === "PAID" || status === "CONFIRMED";
  const canConfirm = status === "SHIPPING" || status === "DELIVERED";

  function run(action: "cancel" | "confirm") {
    startTransition(async () => {
      const result = action === "cancel" ? await cancelOrder(orderId) : await confirmOrder(orderId);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "操作成功");
      router.refresh();
    });
  }

  if (!canCancel && !canConfirm) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canCancel ? (
          <Button disabled={isPending} onClick={() => run("cancel")} size="sm" variant="outline">
            <XCircle className="h-4 w-4" />
            取消订单
          </Button>
        ) : null}
        {canConfirm ? (
          <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={() => run("confirm")} size="sm">
            <CheckCircle2 className="h-4 w-4" />
            确认收货
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-xs text-stone-500">{message}</p> : null}
    </div>
  );
}
