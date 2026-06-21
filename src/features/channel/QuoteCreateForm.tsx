"use client";

import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createQuote } from "@/features/channel/actions";
import { leadSceneLabels } from "@/features/channel/labels";
import type { QuoteFormOptions } from "@/features/channel/queries";
import { formatCurrency } from "@/features/orders/utils";

type QuoteCreateFormProps = {
  options: QuoteFormOptions;
};

function defaultValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function QuoteCreateForm({ options }: QuoteCreateFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    inquiryId: options.inquiries[0]?.id ?? "",
    totalAmount: "",
    validUntil: defaultValidUntil(),
    content: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedInquiry = useMemo(() => options.inquiries.find((item) => item.id === form.inquiryId), [form.inquiryId, options.inquiries]);
  const canSubmit = Boolean(form.inquiryId && form.totalAmount !== "" && form.content);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await createQuote(form);
      setMessage(result.success ? result.message ?? "报价单已生成" : result.error.message);
      if (result.success) {
        setForm((current) => ({ ...current, totalAmount: "", content: "" }));
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-sm ring-1 ring-slate-200">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51] sm:col-span-2"
            onChange={(event) => setForm((current) => ({ ...current, inquiryId: event.target.value }))}
            value={form.inquiryId}
          >
            {options.inquiries.length === 0 ? <option value="">暂无可报价询价单</option> : null}
            {options.inquiries.map((inquiry) => (
              <option key={inquiry.id} value={inquiry.id}>
                {inquiry.inquiryNo} · {inquiry.contactName} · {leadSceneLabels[inquiry.scene]}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51]"
            min={0}
            onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))}
            placeholder="报价金额"
            type="number"
            value={form.totalAmount}
          />
          <input
            className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51]"
            onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
            type="date"
            value={form.validUntil}
          />
          <textarea
            className="min-h-24 rounded-md border border-[var(--dashboard-line)] px-3 py-2 text-sm outline-none focus:border-[#e86f51] sm:col-span-2"
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            placeholder="报价说明、配送范围、开票或账期约定"
            value={form.content}
          />
        </div>
        <div className="rounded-md bg-[var(--dashboard-control)] p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-900">当前询价</p>
          {selectedInquiry ? (
            <div className="mt-3 space-y-2">
              <p>{selectedInquiry.inquiryNo} · {leadSceneLabels[selectedInquiry.scene]}</p>
              <p>{selectedInquiry.contactName} · {selectedInquiry.contactPhone}</p>
              <p>预算：{selectedInquiry.budget === null ? "-" : formatCurrency(selectedInquiry.budget)}</p>
              <p>创建：{selectedInquiry.createdAt}</p>
            </div>
          ) : (
            <p className="mt-3 text-slate-500">请选择一个询价单</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message ? <p className="text-sm text-slate-600">{message}</p> : <span />}
        <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending || !canSubmit} onClick={submit} type="button">
          <FilePlus2 className="h-4 w-4" />
          生成报价单
        </Button>
      </div>
    </section>
  );
}
