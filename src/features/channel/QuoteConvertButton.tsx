"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { convertQuoteToOrder } from "@/features/channel/actions";

type QuoteConvertButtonProps = {
  quoteId: string;
  convertedOrderId: string | null;
  canConvert: boolean;
  disabledReason: string | null;
};

export function QuoteConvertButton({ quoteId, convertedOrderId, canConvert, disabledReason }: QuoteConvertButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (convertedOrderId) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/orders/${convertedOrderId}`}>
          <CheckCircle2 className="h-4 w-4" />
          查看订单
        </Link>
      </Button>
    );
  }

  function convert() {
    setMessage(null);
    startTransition(async () => {
      const result = await convertQuoteToOrder({ quoteId });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      if (!result.data) {
        setMessage("转订单成功但未返回订单信息");
        router.refresh();
        return;
      }
      router.push(`/dashboard/orders/${result.data.orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button disabled={isPending || !canConvert} onClick={convert} size="sm" type="button">
        <ArrowRight className="h-4 w-4" />
        {isPending ? "转单中" : "转订单"}
      </Button>
      {!canConvert && disabledReason ? <p className="text-xs text-amber-600">{disabledReason}</p> : null}
      {message ? <p className="max-w-48 text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
