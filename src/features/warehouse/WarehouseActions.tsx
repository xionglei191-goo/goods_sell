"use client";

import { ClipboardCheck, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createStockCheck, updateSafeStock } from "@/features/warehouse/actions";

export function SafeStockEditor({ productId, initialValue }: { productId: string; initialValue: number }) {
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateSafeStock({ productId, safeStock: value });
      setMessage(result.success ? result.message ?? "已保存" : result.error.message);
    });
  }

  return (
    <div className="flex min-w-[150px] items-center gap-2">
      <input
        className="form-input h-9 w-20 px-2"
        min={0}
        onChange={(event) => setValue(Number(event.target.value))}
        type="number"
        value={value}
      />
      <Button disabled={isPending} onClick={submit} size="sm" type="button" variant="outline">
        <Save className="h-4 w-4" />
      </Button>
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
    </div>
  );
}

export function CreateStockCheckButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createStockCheck();
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.push(`/dashboard/warehouse/checks/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Button className="bg-orange-500 text-white hover:bg-orange-600" disabled={isPending} onClick={submit} type="button">
        <ClipboardCheck className="h-4 w-4" />
        新建盘点
      </Button>
      {message ? <span className="text-sm text-red-600">{message}</span> : null}
    </div>
  );
}
