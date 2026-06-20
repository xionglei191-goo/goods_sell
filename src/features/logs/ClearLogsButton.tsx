"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { clearAuditLogs } from "@/features/logs/actions";

export function ClearLogsButton() {
  const [beforeDate, setBeforeDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!beforeDate) {
      setMessage("请选择截止日期");
      return;
    }
    if (!window.confirm(`确认清除 ${beforeDate} 之前的操作日志？该操作不可撤销。`)) return;
    startTransition(async () => {
      const result = await clearAuditLogs({ beforeDate });
      setMessage(result.success ? `已清除 ${result.data.deleted} 条日志` : result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 surface-panel p-4 sm:flex-row sm:items-center">
      <input className="form-input" onChange={(event) => setBeforeDate(event.target.value)} type="date" value={beforeDate} />
      <Button disabled={isPending} onClick={submit} type="button" variant="outline">
        <Trash2 className="h-4 w-4" />
        手动清除
      </Button>
      {message ? <span className="text-sm text-neutral-500">{message}</span> : <span className="text-sm text-neutral-500">永久保留策略，仅支持管理员手动清除。</span>}
    </div>
  );
}
