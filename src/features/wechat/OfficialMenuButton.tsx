"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { syncOfficialMenu } from "@/features/wechat/actions";

export function OfficialMenuButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await syncOfficialMenu();
      setMessage(result.success ? result.message : result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={handleClick} type="button">
        <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        同步公众号菜单
      </Button>
      {message ? <span className="text-sm text-stone-500">{message}</span> : null}
    </div>
  );
}
