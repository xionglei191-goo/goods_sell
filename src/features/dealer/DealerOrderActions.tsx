"use client";

import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { acceptRouting, completeDealerOrder, rejectRouting, shipDealerOrder } from "@/features/dealer/actions";

type DealerOrderActionsProps = {
  routingId?: string;
  orderId: string;
  mode: "incoming" | "processing";
  status?: string;
};

export function DealerOrderActions({ routingId, orderId, mode, status }: DealerOrderActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: "accept" | "reject" | "ship" | "complete") {
    startTransition(async () => {
      const reason = action === "reject" ? window.prompt("请输入拒单原因", "距离较远，暂不接单") : "";
      if (action === "reject" && reason === null) return;
      const result =
        action === "accept" && routingId
          ? await acceptRouting(routingId)
          : action === "reject" && routingId
            ? await rejectRouting(routingId, reason ?? "")
            : action === "ship"
              ? await shipDealerOrder(orderId)
              : await completeDealerOrder(orderId);

      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "操作成功");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {mode === "incoming" ? (
          <>
            <Button className="h-11 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending || !routingId} onClick={() => run("accept")}>
              <CheckCircle2 className="h-4 w-4" />
              接单
            </Button>
            <Button className="h-11" disabled={isPending || !routingId} onClick={() => run("reject")} variant="outline">
              <XCircle className="h-4 w-4" />
              拒单
            </Button>
          </>
        ) : (
          <>
            <Button className="h-11" disabled={isPending || status === "SHIPPING" || status === "DELIVERED" || status === "COMPLETED"} onClick={() => run("ship")} variant="outline">
              <Send className="h-4 w-4" />
              发货
            </Button>
            <Button className="h-11 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending || status === "COMPLETED"} onClick={() => run("complete")}>
              <CheckCircle2 className="h-4 w-4" />
              完成
            </Button>
          </>
        )}
      </div>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
