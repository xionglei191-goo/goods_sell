"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createCoupon, type CouponInput } from "@/features/marketing/actions";

const todayDate = new Date();
const today = todayDate.toISOString().slice(0, 10);
const nextMonthDate = new Date(todayDate);
nextMonthDate.setDate(todayDate.getDate() + 30);
const nextMonth = nextMonthDate.toISOString().slice(0, 10);

export function CouponForm() {
  const router = useRouter();
  const [input, setInput] = useState<CouponInput>({ name: "", type: "AMOUNT", amount: 10, percent: 9, threshold: 100, totalQuantity: 100, startsAt: today, endsAt: nextMonth });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createCoupon(input);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.push("/dashboard/marketing/coupons");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="grid gap-4 sm:grid-cols-2">
        <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400 sm:col-span-2" onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))} placeholder="优惠券名称" value={input.name} />
        <select className="h-11 rounded-md border border-slate-200 bg-white px-3 outline-none focus:border-blue-400" onChange={(event) => setInput((current) => ({ ...current, type: event.target.value as CouponInput["type"] }))} value={input.type}>
          <option value="AMOUNT">满减</option>
          <option value="PERCENT">折扣</option>
        </select>
        {input.type === "AMOUNT" ? (
          <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400" min={0} onChange={(event) => setInput((current) => ({ ...current, amount: Number(event.target.value) }))} placeholder="面额" type="number" value={input.amount ?? 0} />
        ) : (
          <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400" max={9.9} min={1} onChange={(event) => setInput((current) => ({ ...current, percent: Number(event.target.value) }))} placeholder="折扣，如 9" type="number" value={input.percent ?? 9} />
        )}
        <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400" min={0} onChange={(event) => setInput((current) => ({ ...current, threshold: Number(event.target.value) }))} placeholder="使用门槛" type="number" value={input.threshold} />
        <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400" min={1} onChange={(event) => setInput((current) => ({ ...current, totalQuantity: Number(event.target.value) }))} placeholder="发放数量" type="number" value={input.totalQuantity} />
        <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400" onChange={(event) => setInput((current) => ({ ...current, startsAt: event.target.value }))} type="date" value={input.startsAt} />
        <input className="h-11 rounded-md border border-slate-200 px-3 outline-none focus:border-blue-400" onChange={(event) => setInput((current) => ({ ...current, endsAt: event.target.value }))} type="date" value={input.endsAt} />
      </div>
      {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
      <Button className="mt-5 h-11 w-full" disabled={isPending} onClick={submit}>{isPending ? "创建中" : "创建优惠券"}</Button>
    </div>
  );
}
