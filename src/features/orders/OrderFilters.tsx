"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { OrderListFilters } from "@/features/orders/types";

type OrderFiltersProps = {
  initial: OrderListFilters;
};

export function OrderFilters({ initial }: OrderFiltersProps) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const syncKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      router.replace(`/dashboard/orders${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [filters, router, syncKey]);

  function update(key: keyof OrderListFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="grid gap-3 lg:grid-cols-[1.3fr_repeat(6,minmax(0,1fr))]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => update("customer", event.target.value)}
            placeholder="客户名 / 手机号"
            value={filters.customer}
          />
        </label>
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("status", event.target.value)} value={filters.status}>
          <option value="">全部状态</option>
          <option value="PENDING_PAYMENT">待支付</option>
          <option value="PAID">已支付</option>
          <option value="CONFIRMED">已确认</option>
          <option value="SHIPPING">配送中</option>
          <option value="DELIVERED">已送达</option>
          <option value="COMPLETED">已完成</option>
          <option value="CANCELLED">已取消</option>
        </select>
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("type", event.target.value)} value={filters.type}>
          <option value="">全部类型</option>
          <option value="RETAIL">零售</option>
          <option value="WHOLESALE">批发</option>
          <option value="GROUP_BUY">团购</option>
        </select>
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("startDate", event.target.value)} type="date" value={filters.startDate} />
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("endDate", event.target.value)} type="date" value={filters.endDate} />
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" min="0" onChange={(event) => update("minAmount", event.target.value)} placeholder="最低金额" type="number" value={filters.minAmount} />
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" min="0" onChange={(event) => update("maxAmount", event.target.value)} placeholder="最高金额" type="number" value={filters.maxAmount} />
      </div>
    </div>
  );
}
