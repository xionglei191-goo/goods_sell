"use client";

import type { LeadScene } from "@prisma/client";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createDealerPromoterCode } from "@/features/dealer/actions";

type CopyLinkButtonProps = {
  value: string;
  label?: string;
};

export function CopyLinkButton({ value, label = "复制链接" }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button className="bg-[#e86f51] hover:bg-[#cf5638]" onClick={copy} size="sm" type="button">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "已复制" : label}
    </Button>
  );
}

type CreateDealerPromoterCodeButtonProps = {
  scene: LeadScene;
  label: string;
};

export function CreateDealerPromoterCodeButton({ scene, label }: CreateDealerPromoterCodeButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function createCode() {
    setMessage(null);
    startTransition(async () => {
      const result = await createDealerPromoterCode(scene);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      setMessage(result.message ?? "已生成");
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <Button disabled={isPending} onClick={createCode} size="sm" type="button" variant="outline">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {label}
      </Button>
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
