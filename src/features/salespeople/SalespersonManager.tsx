"use client";

import { KeyRound, Plus, Power, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createSalesperson, resetSalespersonPassword, setSalespersonStatus } from "@/features/salespeople/actions";
import type { SalespersonListItem } from "@/features/salespeople/queries";

type SalespersonManagerProps = {
  filters: {
    q: string;
    status: string;
  };
  salespeople: SalespersonListItem[];
};

export function SalespersonManager({ filters: initialFilters, salespeople }: SalespersonManagerProps) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [form, setForm] = useState({ name: "", phone: "", password: "admin123" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const syncKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      router.replace(`/dashboard/salespeople${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [filters, router, syncKey]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function createUser() {
    startTransition(async () => {
      const result = await createSalesperson(form);
      setMessage(result.success ? result.message ?? "销售员已创建" : result.error.message);
      if (result.success) {
        setForm({ name: "", phone: "", password: "admin123" });
      }
    });
  }

  function toggleStatus(person: SalespersonListItem) {
    startTransition(async () => {
      const result = await setSalespersonStatus({ userId: person.id, isActive: !person.isActive });
      setMessage(result.success ? result.message ?? "状态已更新" : result.error.message);
    });
  }

  function resetPassword(person: SalespersonListItem) {
    startTransition(async () => {
      const result = await resetSalespersonPassword({ userId: person.id, password: "admin123" });
      setMessage(result.success ? `${person.name} 密码已重置为 admin123` : result.error.message);
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <input
              className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51]"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="销售员姓名"
              value={form.name}
            />
            <input
              className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51]"
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="账号 / 手机号"
              value={form.phone}
            />
            <input
              className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51]"
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="初始密码"
              value={form.password}
            />
          </div>
          <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={createUser} type="button">
            <Plus className="h-4 w-4" />
            新增销售员
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </section>

      <section className="grid gap-3 rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1.5fr_1fr]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-md border border-[var(--dashboard-line)] pl-9 pr-3 text-sm outline-none focus:border-[#e86f51]"
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="搜索姓名 / 手机号"
            value={filters.q}
          />
        </label>
        <select
          className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
          onChange={(event) => updateFilter("status", event.target.value)}
          value={filters.status}
        >
          <option value="">全部状态</option>
          <option value="active">启用中</option>
          <option value="inactive">已禁用</option>
        </select>
      </section>

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">销售员</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">地推与客户</th>
                <th className="px-4 py-3 font-medium">线索转化</th>
                <th className="px-4 py-3 font-medium">报价转化</th>
                <th className="px-4 py-3 font-medium">推广码</th>
                <th className="px-4 py-3 font-medium">复购</th>
                <th className="px-4 py-3 font-medium">销售结果</th>
                <th className="px-4 py-3 font-medium">最近成交</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {salespeople.map((person) => (
                <tr className="border-t border-slate-100 align-top hover:bg-[var(--dashboard-control)]" key={person.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{person.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{person.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={person.isActive ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "rounded-full bg-[var(--dashboard-transaction-soft)] px-2 py-1 text-xs text-slate-500"}>
                      {person.isActive ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{person.dealerCount} 个地推经销商</p>
                    <p className="mt-1 text-xs text-slate-500">
                      绑定客户 {person.customerCount} · 普通客户 {person.consumerCustomerCount}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {person.convertedLeadCount}/{person.leadCount}
                      <span className="ml-2 text-xs font-normal text-slate-500">{formatPercent(person.leadConversionRate)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      询价 {person.inquiryCount} · 已报价 {person.quotedInquiryCount}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {person.convertedQuoteCount}/{person.quoteCount}
                      <span className="ml-2 text-xs font-normal text-slate-500">{formatPercent(person.quoteConversionRate)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">询价赢单 {person.wonInquiryCount}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>扫码 {person.promoterScanCount}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      线索 {person.promoterLeadCount} · 订单 {person.promoterOrderCount}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {person.repeatCustomerCount}/{person.buyingCustomerCount}
                      <span className="ml-2 text-xs font-normal text-slate-500">{formatPercent(person.repeatRate)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">复购客户 / 成交客户</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{formatMoney(person.revenue)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      订单 {person.orderCount} · 客单 {formatMoney(person.avgOrderAmount)}
                    </p>
                    {person.receivable > 0 ? <p className="mt-1 text-xs font-medium text-red-700">应收 {formatMoney(person.receivable)}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{person.lastOrderAt ? formatDate(person.lastOrderAt) : "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button disabled={isPending} onClick={() => resetPassword(person)} size="sm" type="button" variant="outline">
                        <KeyRound className="h-4 w-4" />
                        重置
                      </Button>
                      <Button disabled={isPending} onClick={() => toggleStatus(person)} size="sm" type="button" variant="outline">
                        <Power className="h-4 w-4" />
                        {person.isActive ? "禁用" : "启用"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {salespeople.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={10}>
                    暂无销售员
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
