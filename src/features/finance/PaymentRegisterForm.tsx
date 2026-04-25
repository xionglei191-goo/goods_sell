"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { registerPayment } from "@/features/finance/actions";
import { formatCurrency, formatDate } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

type PaymentRegisterFormProps = {
  data: {
    customerId: string;
    customers: Array<{ id: string; name: string; phone: string }>;
    orders: Array<{ id: string; orderNo: string; remaining: number; payableAmount: number; paidAmount: number; createdAt: string; overdue: boolean }>;
  };
};

export function PaymentRegisterForm({ data }: PaymentRegisterFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(data.customerId);
  const [method, setMethod] = useState<"WECHAT" | "CASH" | "TRANSFER">("TRANSFER");
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const total = Object.values(allocations).reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0);

  function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setAllocations({});
    router.push(`/dashboard/finance/payments?customerId=${nextCustomerId}`);
  }

  function submit() {
    const selected = Object.entries(allocations)
      .filter(([, amount]) => amount > 0)
      .map(([orderId, amount]) => ({ orderId, amount }));
    startTransition(async () => {
      const result = await registerPayment({ customerId, method, allocations: selected });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "收款已登记");
      setAllocations({});
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">待核销订单</h2>
        <div className="mt-4 space-y-3">
          {data.orders.map((order) => (
            <div className={cn("grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_150px]", order.overdue ? "border-red-200 bg-red-50" : "border-slate-200")} key={order.id}>
              <div>
                <p className="font-medium text-slate-900">{order.orderNo}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(order.createdAt)} · 应收 {formatCurrency(order.payableAmount)} · 已收 {formatCurrency(order.paidAmount)}
                </p>
                {order.overdue ? <p className="mt-1 text-xs font-medium text-red-700">账期超过 30 天</p> : null}
              </div>
              <input
                className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                max={order.remaining}
                min={0}
                onChange={(event) => setAllocations((current) => ({ ...current, [order.id]: Math.min(Number(event.target.value), order.remaining) }))}
                placeholder={`剩余 ${formatCurrency(order.remaining)}`}
                type="number"
                value={allocations[order.id] ?? ""}
              />
            </div>
          ))}
          {data.orders.length === 0 ? <div className="rounded-lg bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">该客户暂无待核销订单</div> : null}
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">登记收款</h2>
          <div className="mt-4 space-y-3">
            <select className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-400" onChange={(event) => changeCustomer(event.target.value)} value={customerId}>
              {data.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.phone}
                </option>
              ))}
            </select>
            <select className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-400" onChange={(event) => setMethod(event.target.value as typeof method)} value={method}>
              <option value="TRANSFER">转账</option>
              <option value="CASH">现金</option>
              <option value="WECHAT">微信</option>
            </select>
          </div>
          {message ? <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">{message}</p> : null}
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-500">本次收款</span>
            <span className="text-2xl font-bold text-slate-900">{formatCurrency(total)}</span>
          </div>
          <Button className="mt-4 h-11 w-full" disabled={isPending || total <= 0} onClick={submit}>
            {isPending ? "登记中" : "确认收款"}
          </Button>
        </section>
      </aside>
    </div>
  );
}
