"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { PurchaseStatus } from "@prisma/client";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createPurchaseOrder, receivePurchaseOrder, updatePurchaseStatus } from "@/features/purchase/actions";
import { formatCurrency, type PurchaseOrderItem, type PurchaseProductOption, type SupplierItem } from "@/features/purchase/queries";
import { purchaseOrderSchema, type PurchaseOrderFormValues, type PurchaseOrderInput } from "@/features/purchase/schemas";

type PurchaseManagerProps = {
  orders: PurchaseOrderItem[];
  products: PurchaseProductOption[];
  suppliers: SupplierItem[];
};

const statusLabels: Record<PurchaseStatus, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  RECEIVED: "已收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export function PurchaseManager({ orders, products, suppliers }: PurchaseManagerProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PurchaseOrderFormValues, unknown, PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplierId: suppliers[0]?.id ?? "",
      productId: products[0]?.id ?? "",
      quantity: 1,
      unitCost: products[0]?.costPrice ?? 0,
      remark: "",
    },
  });

  function submit(values: PurchaseOrderInput) {
    setMessage(null);
    startTransition(async () => {
      const result = await createPurchaseOrder(values);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  function receive(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await receivePurchaseOrder(id);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function complete(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await updatePurchaseStatus(id, "COMPLETED");
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">创建采购单</h2>
        <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(submit)}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">供应商</span>
            <select className="form-input" {...form.register("supplierId")}>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">产品</span>
            <select className="form-input" {...form.register("productId")}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}（{product.sku}）
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">数量</span>
            <input className="form-input" min={1} type="number" {...form.register("quantity")} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">采购单价</span>
            <input className="form-input" step="0.01" type="number" {...form.register("unitCost")} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">备注</span>
            <textarea className="form-input min-h-20 resize-y py-3" {...form.register("remark")} />
          </label>
          {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
          <Button disabled={isPending} type="submit">
            创建并提交
          </Button>
        </form>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">采购订单</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-3 font-medium">采购单号</th>
                <th className="py-3 font-medium">供应商</th>
                <th className="py-3 font-medium">状态</th>
                <th className="py-3 font-medium">金额</th>
                <th className="py-3 font-medium">创建时间</th>
                <th className="py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr className="border-b border-slate-100 last:border-0" key={order.id}>
                  <td className="py-3 font-medium text-slate-900">{order.purchaseNo}</td>
                  <td className="py-3 text-slate-600">{order.supplier}</td>
                  <td className="py-3 text-slate-600">{statusLabels[order.status]}</td>
                  <td className="py-3 font-medium text-slate-900">{formatCurrency(order.totalAmount)}</td>
                  <td className="py-3 text-slate-600">{order.createdAt}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button disabled={isPending || order.status === "COMPLETED"} onClick={() => receive(order.id)} size="sm" variant="outline">
                        <ClipboardCheck className="h-4 w-4" />
                        收货入库
                      </Button>
                      <Button disabled={isPending || order.status === "COMPLETED"} onClick={() => complete(order.id)} size="sm" variant="outline">
                        <CheckCircle2 className="h-4 w-4" />
                        完成
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
