"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { refreshCustomerProfile } from "@/features/ai/profile-actions";

export function ProfileRefreshButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await refreshCustomerProfile(customerId);
      setMessage(result.success ? result.message ?? "已更新" : result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} size="sm" variant="outline" disabled={isPending}>
        <Sparkles className="h-4 w-4" />
        {isPending ? "分析中" : "刷新画像"}
      </Button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
