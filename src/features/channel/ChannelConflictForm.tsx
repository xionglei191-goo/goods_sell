"use client";

import type { ChannelConflictType } from "@prisma/client";
import { AlertTriangle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createChannelConflict } from "@/features/channel/actions";
import { channelConflictTypeLabels } from "@/features/channel/labels";
import type { ChannelConflictFormOptions } from "@/features/channel/queries";

type ChannelConflictFormProps = {
  options: ChannelConflictFormOptions;
};

type FormState = {
  type: ChannelConflictType;
  summary: string;
  orderId: string;
  dealerId: string;
  customerId: string;
  ownerId: string;
  detail: string;
};

const conflictTypes: ChannelConflictType[] = ["CROSS_ZONE", "PRICE_ANOMALY", "REJECTION", "COMPLAINT", "STOCK_MISMATCH", "OTHER"];

export function ChannelConflictForm({ options }: ChannelConflictFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    type: "CROSS_ZONE",
    summary: "",
    orderId: "",
    dealerId: "",
    customerId: "",
    ownerId: "",
    detail: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit = form.summary.trim().length >= 2;

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await createChannelConflict(form);
      setMessage(result.success ? result.message ?? "渠道冲突已记录" : result.error.message);
      if (result.success) {
        setForm((current) => ({ ...current, summary: "", detail: "" }));
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        记录渠道冲突
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-6">
        <select
          className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
          onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ChannelConflictType }))}
          value={form.type}
        >
          {conflictTypes.map((type) => (
            <option key={type} value={type}>
              {channelConflictTypeLabels[type]}
            </option>
          ))}
        </select>
        <input
          className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51] lg:col-span-2"
          onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
          placeholder="冲突摘要"
          value={form.summary}
        />
        <select
          className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
          onChange={(event) => setForm((current) => ({ ...current, orderId: event.target.value }))}
          value={form.orderId}
        >
          <option value="">关联订单</option>
          {options.orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
          onChange={(event) => setForm((current) => ({ ...current, dealerId: event.target.value }))}
          value={form.dealerId}
        >
          <option value="">关联经销商</option>
          {options.dealers.map((dealer) => (
            <option key={dealer.id} value={dealer.id}>
              {dealer.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
          onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
          value={form.customerId}
        >
          <option value="">关联客户</option>
          {options.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
          onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))}
          value={form.ownerId}
        >
          <option value="">处理负责人</option>
          {options.owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.label}
            </option>
          ))}
        </select>
        <textarea
          className="min-h-20 rounded-md border border-[var(--dashboard-line)] px-3 py-2 text-sm outline-none focus:border-[#e86f51] lg:col-span-5"
          onChange={(event) => setForm((current) => ({ ...current, detail: event.target.value }))}
          placeholder="详细说明、客户反馈、价格截图备注或处理线索"
          value={form.detail}
        />
        <Button className="h-10 bg-[#dc2626] text-white hover:bg-[#b91c1c] lg:self-start" disabled={isPending || !canSubmit} onClick={submit} type="button">
          <Plus className="h-4 w-4" />
          新增
        </Button>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
