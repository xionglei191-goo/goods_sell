"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function DeliveryFilters({ initial }: { initial: { status: string; q: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial.status);
  const [q, setQ] = useState(initial.q);

  function apply() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    router.push(`/dashboard/delivery${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[180px_1fr_auto]">
      <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setStatus(event.target.value)} value={status}>
        <option value="">全部配送状态</option>
        <option value="PAID">待发货</option>
        <option value="CONFIRMED">已确认</option>
        <option value="SHIPPING">配送中</option>
        <option value="DELIVERED">已送达</option>
        <option value="COMPLETED">已完成</option>
      </select>
      <input
        className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300"
        onChange={(event) => setQ(event.target.value)}
        placeholder="订单号 / 客户 / 手机号"
        value={q}
      />
      <Button onClick={apply} type="button">
        <Search className="h-4 w-4" />
        筛选
      </Button>
    </div>
  );
}
