"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { issueCouponByTag } from "@/features/marketing/actions";

export function IssueCouponButton({ couponId, tags }: { couponId: string; tags: string[] }) {
  const router = useRouter();
  const [tag, setTag] = useState(tags[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function issue() {
    startTransition(async () => {
      const result = await issueCouponByTag(couponId, tag);
      setMessage(result.success ? result.message ?? "已发放" : result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-[260px] items-center gap-2">
      <select className="form-input h-9 min-w-0 flex-1 px-2 text-xs" onChange={(event) => setTag(event.target.value)} value={tag}>
        {tags.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <Button disabled={!tag || isPending} onClick={issue} size="sm" variant="outline">
        <Send className="h-4 w-4" />
        发放
      </Button>
      {message ? <span className="text-xs text-neutral-500">{message}</span> : null}
    </div>
  );
}
