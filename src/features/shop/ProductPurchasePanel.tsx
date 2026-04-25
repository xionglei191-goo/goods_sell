"use client";

import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addToCart } from "@/features/shop/actions";
import { AddToCartButton } from "@/features/shop/AddToCartButton";

type ProductPurchasePanelProps = {
  productId: string;
  stock: number;
};

export function ProductPurchasePanel({ productId, stock }: ProductPurchasePanelProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const soldOut = stock <= 0;

  function changeQuantity(next: number) {
    setQuantity(Math.max(1, Math.min(stock, next)));
  }

  function buyNow() {
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

      router.push(`/shop/checkout?items=${result.data.itemId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500">数量</span>
        <div className="flex h-11 overflow-hidden rounded-md border border-stone-200 bg-white">
          <button aria-label="减少数量" className="flex w-11 items-center justify-center text-stone-600 hover:bg-stone-50 disabled:text-stone-300" disabled={quantity <= 1} onClick={() => changeQuantity(quantity - 1)} type="button">
            <Minus className="h-4 w-4" />
          </button>
          <input
            className="w-14 border-x border-stone-200 text-center outline-none"
            max={stock}
            min={1}
            onChange={(event) => changeQuantity(Number(event.target.value))}
            type="number"
            value={quantity}
          />
          <button aria-label="增加数量" className="flex w-11 items-center justify-center text-stone-600 hover:bg-stone-50 disabled:text-stone-300" disabled={quantity >= stock} onClick={() => changeQuantity(quantity + 1)} type="button">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-stone-400">库存 {stock}</span>
      </div>

      {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <AddToCartButton className="h-12 bg-orange-500 hover:bg-orange-600" disabled={soldOut} productId={productId} quantity={quantity}>
          加入购物车
        </AddToCartButton>
        <Button className="h-12 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={soldOut || isPending} onClick={buyNow} type="button">
          <ShoppingBag className="h-4 w-4" />
          {isPending ? "处理中" : "立即购买"}
        </Button>
      </div>
    </div>
  );
}
