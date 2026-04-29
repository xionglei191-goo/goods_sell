"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { recordProductPushEvent, type ProductPushEventInput } from "@/features/marketing/actions";

type ProductPushEventButtonProps = {
  id: string;
  event: ProductPushEventInput["event"];
  label: string;
};

export function ProductPushEventButton({ id, event, label }: ProductPushEventButtonProps) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function record() {
    setDone(false);
    startTransition(async () => {
      const result = await recordProductPushEvent({ id, event });
      if (result.success) {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <Button disabled={isPending} onClick={record} size="xs" type="button" variant={event === "CANCELLED" ? "outline" : "secondary"}>
      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? <Check className="h-3 w-3" /> : null}
      {label}
    </Button>
  );
}
