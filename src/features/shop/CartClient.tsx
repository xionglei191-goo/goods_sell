"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteCartItem, selectAllCartItems, updateCartItemQuantity, updateCartItemSelected } from "@/features/shop/actions";
import { ProductArt } from "@/features/shop/ProductArt";
import type { CartItemView } from "@/features/shop/types";
import { calcCartTotal, formatCurrency } from "@/features/shop/utils";

type CartClientProps = {
  initialItems: CartItemView[];
};

export function CartClient({ initialItems }: CartClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedItems = items.filter((item) => item.selected && item.isAvailable);
  const allSelected = items.length > 0 && items.every((item) => item.selected);
  const total = useMemo(() => calcCartTotal(items), [items]);

  function updateLocal(itemId: string, patch: Partial<CartItemView>) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch, subtotal: (patch.price ?? item.price) * (patch.quantity ?? item.quantity) } : item)));
  }

  function changeQuantity(item: CartItemView, nextQuantity: number) {
    const quantity = Math.max(1, Math.min(item.stock, nextQuantity));
    updateLocal(item.id, { quantity, isAvailable: quantity <= item.stock });
    startTransition(async () => {
      const result = await updateCartItemQuantity({ itemId: item.id, quantity });
      if (!result.success) {
        setMessage(result.error.message);
        router.refresh();
      }
    });
  }

  function toggleSelected(item: CartItemView, selected: boolean) {
    updateLocal(item.id, { selected });
    startTransition(async () => {
      const result = await updateCartItemSelected({ itemId: item.id, selected });
      if (!result.success) setMessage(result.error.message);
    });
  }

  function toggleAll() {
    const next = !allSelected;
    setItems((current) => current.map((item) => ({ ...item, selected: next })));
    startTransition(async () => {
      const result = await selectAllCartItems(next);
      if (!result.success) setMessage(result.error.message);
    });
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    startTransition(async () => {
      const result = await deleteCartItem(itemId);
      if (!result.success) {
        setMessage(result.error.message);
        router.refresh();
      }
    });
  }

  function checkout() {
    if (selectedItems.length === 0) {
      setMessage("请选择可结算商品");
      return;
    }

    router.push(`/shop/checkout?items=${selectedItems.map((item) => item.id).join(",")}`);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-white px-4 py-16 text-center shadow-sm ring-1 ring-stone-200">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-3xl font-bold text-[#dc2626]">空</div>
        <h1 className="mt-5 text-xl font-bold text-stone-950">购物车还是空的</h1>
        <p className="mt-2 text-sm text-stone-500">去挑几件湘潭本地好货吧。</p>
        <Button asChild className="mt-6 bg-[#dc2626] text-white hover:bg-[#b91c1c]">
          <Link href="/shop">去逛逛</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-950">购物车</h1>
        <p className="mt-1 text-sm text-stone-500">已加入 {items.length} 种商品</p>
      </div>

      {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

      <div className="space-y-3">
        {items.map((item) => (
          <article className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-stone-200" key={item.id}>
            <div className="flex gap-3">
              <input checked={item.selected} className="mt-10 h-5 w-5 shrink-0 accent-[#dc2626]" onChange={(event) => toggleSelected(item, event.target.checked)} type="checkbox" />
              <Link className="block h-24 w-24 shrink-0 overflow-hidden rounded-md" href={`/shop/product/${item.productId}`}>
                <ProductArt categoryName={item.brandName} className="h-full w-full" name={item.name} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link className="line-clamp-2 font-semibold text-stone-950" href={`/shop/product/${item.productId}`}>
                      {item.name}
                    </Link>
                    <p className="mt-1 text-xs text-stone-500">{item.brandName} · {item.spec ?? item.unit}</p>
                    {!item.isAvailable ? <p className="mt-2 text-xs font-medium text-red-600">{item.stock <= 0 ? "该商品已售罄" : `库存仅剩 ${item.stock}`}</p> : null}
                  </div>
                  <button aria-label="删除商品" className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-red-600" onClick={() => removeItem(item.id)} type="button">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#dc2626]">{formatCurrency(item.price)}</p>
                    <p className="text-xs text-stone-400">小计 {formatCurrency(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex h-9 overflow-hidden rounded-md border border-stone-200">
                    <button aria-label="减少数量" className="flex w-9 items-center justify-center hover:bg-stone-50 disabled:text-stone-300" disabled={item.quantity <= 1 || isPending} onClick={() => changeQuantity(item, item.quantity - 1)} type="button">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      className="w-12 border-x border-stone-200 text-center text-sm outline-none"
                      max={item.stock}
                      min={1}
                      onChange={(event) => changeQuantity(item, Number(event.target.value))}
                      type="number"
                      value={item.quantity}
                    />
                    <button aria-label="增加数量" className="flex w-9 items-center justify-center hover:bg-stone-50 disabled:text-stone-300" disabled={item.quantity >= item.stock || isPending} onClick={() => changeQuantity(item, item.quantity + 1)} type="button">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="sticky bottom-16 z-30 rounded-lg border border-stone-200 bg-white p-4 shadow-lg md:bottom-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input checked={allSelected} className="h-5 w-5 accent-[#dc2626]" onChange={toggleAll} type="checkbox" />
            全选
          </label>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="text-right">
              <p className="text-xs text-stone-400">合计</p>
              <p className="text-xl font-bold text-[#dc2626]">{formatCurrency(total)}</p>
            </div>
            <Button className="h-11 bg-[#dc2626] px-5 text-white hover:bg-[#b91c1c]" disabled={selectedItems.length === 0 || isPending} onClick={checkout}>
              结算({selectedItems.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
