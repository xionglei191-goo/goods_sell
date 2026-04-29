"use client";

import { Check, Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { reportDealerStock } from "@/features/dealer/actions";

type DealerStockReportFormProps = {
  productId: string;
  initialStock: number;
};

export function DealerStockReportForm({ productId, initialStock }: DealerStockReportFormProps) {
  const [stock, setStock] = useState(String(initialStock));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await reportDealerStock({ productId, stock });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      setMessage(result.message ?? "已上报");
    });
  }

  return (
    <form className="flex items-center gap-2" onSubmit={submit}>
      <input
        className="h-9 w-24 rounded-md border border-slate-200 bg-white px-3 text-center text-sm font-medium text-slate-900 outline-none focus:border-[#dc2626] focus:ring-2 focus:ring-red-100"
        inputMode="numeric"
        min={0}
        onChange={(event) => setStock(event.target.value)}
        type="number"
        value={stock}
      />
      <Button className="bg-slate-900 hover:bg-slate-800" disabled={isPending} size="sm" type="submit">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : message ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        上报
      </Button>
      {message ? <span className={message === "库存已上报" || message === "已上报" ? "text-xs text-emerald-600" : "text-xs text-red-600"}>{message}</span> : null}
    </form>
  );
}
