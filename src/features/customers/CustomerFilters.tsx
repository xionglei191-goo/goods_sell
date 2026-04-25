"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type CustomerFiltersProps = {
  initial: {
    q: string;
    type: string;
    salesPersonId: string;
    tag: string;
  };
  salespeople: Array<{ id: string; name: string }>;
};

export function CustomerFilters({ initial, salespeople }: CustomerFiltersProps) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const syncKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      router.replace(`/dashboard/customers${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [filters, router, syncKey]);

  function update(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <label className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("q", event.target.value)} placeholder="客户名 / 手机号" value={filters.q} />
      </label>
      <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("type", event.target.value)} value={filters.type}>
        <option value="">全部类型</option>
        <option value="CONSUMER">消费者</option>
        <option value="DEALER">经销商</option>
      </select>
      <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("salesPersonId", event.target.value)} value={filters.salesPersonId}>
        <option value="">全部销售员</option>
        {salespeople.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" onChange={(event) => update("tag", event.target.value)} placeholder="标签" value={filters.tag} />
    </div>
  );
}
