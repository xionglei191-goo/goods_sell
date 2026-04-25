"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { stockIn, stockOut } from "@/features/inventory/actions";
import { stockMovementSchema, type StockMovementFormValues, type StockMovementInput } from "@/features/inventory/schemas";
import type { InventoryItem } from "@/features/inventory/queries";

type StockMovementFormProps = {
  mode: "in" | "out";
  products: InventoryItem[];
};

export function StockMovementForm({ mode, products }: StockMovementFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<StockMovementFormValues, unknown, StockMovementInput>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      productId: products[0]?.id ?? "",
      quantity: 1,
      remark: "",
    },
  });

  const filteredProducts = useMemo(() => {
    return products.filter((product) => product.name.includes(query) || product.sku.includes(query));
  }, [products, query]);

  function submit(values: StockMovementInput) {
    setMessage(null);
    startTransition(async () => {
      const result = mode === "in" ? await stockIn(values) : await stockOut(values);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.push("/dashboard/inventory/records");
      router.refresh();
    });
  }

  return (
    <form className="max-w-2xl space-y-5 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200" onSubmit={form.handleSubmit(submit)}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">搜索产品</span>
        <input className="form-input" onChange={(event) => setQuery(event.target.value)} placeholder="输入产品名称或 SKU" value={query} />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">选择产品</span>
        <select className="form-input" {...form.register("productId")}>
          {filteredProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}（当前库存 {product.stock}）
            </option>
          ))}
        </select>
        {form.formState.errors.productId ? <p className="mt-1 text-sm text-red-600">{form.formState.errors.productId.message}</p> : null}
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">{mode === "in" ? "入库数量" : "出库数量"}</span>
        <input className="form-input" min={1} type="number" {...form.register("quantity")} />
        {form.formState.errors.quantity ? <p className="mt-1 text-sm text-red-600">{form.formState.errors.quantity.message}</p> : null}
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">备注</span>
        <textarea className="form-input min-h-24 resize-y py-3" placeholder="采购入库、退货入库、订单出库等" {...form.register("remark")} />
      </label>

      {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "提交中..." : mode === "in" ? "确认入库" : "确认出库"}
      </Button>
    </form>
  );
}
