"use client";

import type { ChannelConflictStatus } from "@prisma/client";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateChannelConflict } from "@/features/channel/actions";
import { channelConflictStatusLabels } from "@/features/channel/labels";
import type { ChannelConflictFormOptions } from "@/features/channel/queries";

type ChannelConflictActionsProps = {
  conflictId: string;
  initialOwnerId: string | null;
  initialStatus: ChannelConflictStatus;
  owners: ChannelConflictFormOptions["owners"];
};

const conflictStatuses: ChannelConflictStatus[] = ["OPEN", "PROCESSING", "RESOLVED", "IGNORED"];

export function ChannelConflictActions({ conflictId, initialOwnerId, initialStatus, owners }: ChannelConflictActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ChannelConflictStatus>(initialStatus);
  const [ownerId, setOwnerId] = useState(initialOwnerId ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isChanged = status !== initialStatus || ownerId !== (initialOwnerId ?? "") || note.trim().length > 0;

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateChannelConflict({ conflictId, status, ownerId, note });
      setMessage(result.success ? result.message ?? "已更新" : result.error.message);
      if (result.success) {
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid min-w-64 gap-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400"
          onChange={(event) => setStatus(event.target.value as ChannelConflictStatus)}
          value={status}
        >
          {conflictStatuses.map((item) => (
            <option key={item} value={item}>
              {channelConflictStatusLabels[item]}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400"
          onChange={(event) => setOwnerId(event.target.value)}
          value={ownerId}
        >
          <option value="">待分派</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="min-h-16 rounded-md border border-slate-200 px-2 py-2 text-xs outline-none focus:border-blue-400"
        onChange={(event) => setNote(event.target.value)}
        placeholder="处理备注"
        value={note}
      />
      <div className="flex items-center justify-between gap-2">
        {message ? <p className="truncate text-xs text-slate-500">{message}</p> : <span />}
        <Button className="h-8 bg-slate-900 px-3 text-xs text-white hover:bg-slate-700" disabled={isPending || !isChanged} onClick={submit} type="button">
          <Save className="h-3.5 w-3.5" />
          保存
        </Button>
      </div>
    </div>
  );
}
