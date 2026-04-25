"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addToCart } from "@/features/shop/actions";
import { cn } from "@/lib/utils";

type AddToCartButtonProps = {
  productId: string;
  quantity?: number;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  onDone?: () => void;
};

export function AddToCartButton({ productId, quantity = 1, disabled, className, children, onDone }: AddToCartButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  function handleAdd() {
    startTransition(async () => {
      const result = await addToCart({ productId, quantity });
      if (!result.success) {
        if (result.error.redirectTo) {
          router.push(result.error.redirectTo);
          return;
        }
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "已加入购物车");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <span className="relative inline-flex">
      <Button className={cn("bg-[#dc2626] text-white hover:bg-[#b91c1c]", className)} disabled={disabled || isPending} onClick={handleAdd} type="button">
        {children ?? (
          <>
            <ShoppingCart className="h-4 w-4" />
            {isPending ? "加入中" : "加购"}
          </>
        )}
      </Button>
      {message ? (
        <span className="absolute -top-10 right-0 z-20 whitespace-nowrap rounded-full bg-stone-950 px-3 py-1 text-xs font-medium text-white shadow-lg">
          {message}
        </span>
      ) : null}
    </span>
  );
}
