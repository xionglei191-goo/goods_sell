"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogFilters({ initial, modules }: { initial: { module: string; operator: string; startDate: string; endDate: string }; modules: string[] }) {
  const router = useRouter();
  const [module, setModule] = useState(initial.module);
  const [operator, setOperator] = useState(initial.operator);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);

  function apply() {
    const params = new URLSearchParams();
    if (module) params.set("module", module);
    if (operator.trim()) params.set("operator", operator.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    router.push(`/dashboard/logs${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:grid-cols-[180px_1fr_160px_160px_auto]">
      <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setModule(event.target.value)} value={module}>
        <option value="">全部模块</option>
        {modules.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setOperator(event.target.value)} placeholder="操作人" value={operator} />
      <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
      <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
      <Button onClick={apply} type="button">
        <Search className="h-4 w-4" />
        筛选
      </Button>
    </div>
  );
}
