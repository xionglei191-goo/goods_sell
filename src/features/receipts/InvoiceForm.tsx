"use client";

import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { issueInvoice } from "@/features/receipts/actions";
import { formatCurrency } from "@/features/receipts/queries";

type InvoiceableOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  amount: number;
};

export function InvoiceForm({ orders }: { orders: InvoiceableOrder[] }) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const selected = useMemo(() => orders.find((order) => order.id === orderId), [orderId, orders]);
  const [type, setType] = useState<"NORMAL" | "SPECIAL">("NORMAL");
  const [buyerName, setBuyerName] = useState(selected?.customerName ?? "");
  const [buyerTaxNo, setBuyerTaxNo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeOrder(nextOrderId: string) {
    setOrderId(nextOrderId);
    const next = orders.find((order) => order.id === nextOrderId);
    if (next) setBuyerName(next.customerName);
  }

  function submit() {
    startTransition(async () => {
      const result = await issueInvoice({ orderId, type, buyerName, buyerTaxNo });
      setMessage(result.success ? `${result.message}：${result.data.invoiceNo}` : result.error.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <FilePlus2 className="h-5 w-5 text-[#dc2626]" />
        <h2 className="font-semibold text-slate-900">开具电子发票</h2>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 md:col-span-2" onChange={(event) => changeOrder(event.target.value)} value={orderId}>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.orderNo} · {order.customerName} · {formatCurrency(order.amount)}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setType(event.target.value as typeof type)} value={type}>
          <option value="NORMAL">电子普通发票</option>
          <option value="SPECIAL">电子专用发票</option>
        </select>
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setBuyerName(event.target.value)} placeholder="购方名称" value={buyerName} />
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300 md:col-span-2" onChange={(event) => setBuyerTaxNo(event.target.value)} placeholder="购方税号（可选）" value={buyerTaxNo} />
      </div>
      {selected ? <p className="mt-3 text-sm text-slate-500">开票金额：{formatCurrency(selected.amount)}，未配置税控时自动生成 Mock 发票号。</p> : <p className="mt-3 text-sm text-slate-500">暂无待开票订单。</p>}
      <Button className="mt-4 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={!orderId || isPending} onClick={submit} type="button">
        <FilePlus2 className="h-4 w-4" />
        {isPending ? "开票中" : "开具发票"}
      </Button>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
