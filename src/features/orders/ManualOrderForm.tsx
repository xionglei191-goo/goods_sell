"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createManualOrder } from "@/features/orders/actions";
import type { ManualOrderOptions } from "@/features/orders/types";
import { formatCurrency } from "@/features/orders/utils";

type ManualOrderFormProps = {
  options: ManualOrderOptions;
};

type DraftItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export function ManualOrderForm({ options }: ManualOrderFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(options.customers[0]?.id ?? "");
  const selectedCustomer = options.customers.find((customer) => customer.id === customerId);
  const [addressId, setAddressId] = useState(selectedCustomer?.addresses.find((address) => address.isDefault)?.id ?? selectedCustomer?.addresses[0]?.id ?? "");
  const [type, setType] = useState<"RETAIL" | "WHOLESALE" | "GROUP_BUY">("RETAIL");
  const [payMethod, setPayMethod] = useState<"WECHAT" | "CASH" | "TRANSFER" | "CREDIT">("WECHAT");
  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ productId: options.products[0]?.id ?? "", quantity: 1, unitPrice: options.products[0]?.retailPrice ?? 0 }]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const productMap = useMemo(() => new Map(options.products.map((product) => [product.id, product])), [options.products]);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function changeCustomer(nextCustomerId: string) {
    const nextCustomer = options.customers.find((customer) => customer.id === nextCustomerId);
    setCustomerId(nextCustomerId);
    setAddressId(nextCustomer?.addresses.find((address) => address.isDefault)?.id ?? nextCustomer?.addresses[0]?.id ?? "");
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        const product = patch.productId ? productMap.get(patch.productId) : productMap.get(next.productId);
        if (patch.productId && product) {
          next.unitPrice = type === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
          next.quantity = Math.min(next.quantity, Math.max(product.stock, 1));
        }
        return next;
      }),
    );
  }

  function addItem() {
    const product = options.products[0];
    if (!product) return;
    setItems((current) => [...current, { productId: product.id, quantity: 1, unitPrice: type === "WHOLESALE" ? product.wholesalePrice : product.retailPrice }]);
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await createManualOrder({ customerId, addressId, type, payMethod, remark, items });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      router.push(`/dashboard/orders/${result.data.orderId}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">客户与地址</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select className="form-input h-11" onChange={(event) => changeCustomer(event.target.value)} value={customerId}>
              {options.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.phone}
                </option>
              ))}
            </select>
            <select className="form-input h-11" onChange={(event) => setAddressId(event.target.value)} value={addressId}>
              {(selectedCustomer?.addresses ?? []).map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-950">商品明细</h2>
            <Button onClick={addItem} size="sm" variant="outline">
              <Plus className="h-4 w-4" />
              添加商品
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((item, index) => {
              const product = productMap.get(item.productId);
              return (
                <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1.5fr)_120px_120px_44px]" key={`${item.productId}-${index}`} style={{ borderColor: "var(--dashboard-line)" }}>
                  <select className="form-input min-w-0" onChange={(event) => updateItem(index, { productId: event.target.value })} value={item.productId}>
                    {options.products.map((productOption) => (
                      <option key={productOption.id} value={productOption.id}>
                        {productOption.name} · 库存 {productOption.stock}
                      </option>
                    ))}
                  </select>
                  <div className="flex h-10 overflow-hidden rounded-md border" style={{ borderColor: "var(--dashboard-line)", backgroundColor: "var(--dashboard-control)" }}>
                    <button className="flex w-9 items-center justify-center text-neutral-500 disabled:text-neutral-300" disabled={item.quantity <= 1} onClick={() => updateItem(index, { quantity: item.quantity - 1 })} type="button">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input className="w-full border-x text-center text-sm outline-none" max={product?.stock ?? 1} min={1} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} style={{ borderColor: "var(--dashboard-line)" }} type="number" value={item.quantity} />
                    <button className="flex w-9 items-center justify-center text-neutral-500 disabled:text-neutral-300" disabled={Boolean(product && item.quantity >= product.stock)} onClick={() => updateItem(index, { quantity: item.quantity + 1 })} type="button">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <input className="form-input" min={0.01} onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} type="number" value={item.unitPrice} />
                  <button aria-label="删除商品" className="flex h-10 w-10 items-center justify-center rounded-md border text-neutral-500 hover:bg-orange-50" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ borderColor: "var(--dashboard-line)" }} type="button">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">订单设置</h2>
          <div className="mt-4 space-y-3">
            <select className="form-input h-11" onChange={(event) => setType(event.target.value as typeof type)} value={type}>
              <option value="RETAIL">零售</option>
              <option value="WHOLESALE">批发</option>
              <option value="GROUP_BUY">团购</option>
            </select>
            <select className="form-input h-11" onChange={(event) => setPayMethod(event.target.value as typeof payMethod)} value={payMethod}>
              <option value="WECHAT">微信</option>
              <option value="CASH">现金</option>
              <option value="TRANSFER">转账</option>
              <option value="CREDIT">赊账</option>
            </select>
            <textarea className="form-input min-h-24 py-2" onChange={(event) => setRemark(event.target.value)} placeholder="订单备注" value={remark} />
          </div>
          {message ? <p className="mt-3 rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</p> : null}
          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
            <span className="text-sm text-neutral-500">应收合计</span>
            <span className="text-2xl font-bold text-neutral-950">{formatCurrency(total)}</span>
          </div>
          <Button className="mt-4 h-11 w-full" disabled={isPending || items.length === 0 || !customerId || !addressId} onClick={submit}>
            {isPending ? "创建中" : "创建订单"}
          </Button>
        </section>
      </aside>
    </div>
  );
}
