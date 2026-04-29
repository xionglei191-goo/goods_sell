"use client";

import type { DealerPriceLevel } from "@prisma/client";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateDealerPolicy } from "@/features/channel/actions";
import { dealerPriceLevelLabels } from "@/features/channel/labels";
import type { DealerPolicyPageData } from "@/features/channel/queries";

type DealerPolicyFormProps = {
  data: DealerPolicyPageData;
};

type FormState = {
  minOrderAmount: string;
  maxOrderAmount: string;
  priceLevel: DealerPriceLevel;
  allowCrossZone: boolean;
  allowReject: boolean;
  rejectLimitPerDay: string;
  priority: string;
  brandIds: string[];
  notes: string;
};

export function DealerPolicyForm({ data }: DealerPolicyFormProps) {
  const router = useRouter();
  const policy = data.dealer.policy;
  const [form, setForm] = useState<FormState>({
    minOrderAmount: String(policy?.minOrderAmount ?? 0),
    maxOrderAmount: policy?.maxOrderAmount === null || policy?.maxOrderAmount === undefined ? "" : String(policy.maxOrderAmount),
    priceLevel: policy?.priceLevel ?? "RETAIL",
    allowCrossZone: policy?.allowCrossZone ?? false,
    allowReject: policy?.allowReject ?? true,
    rejectLimitPerDay: String(policy?.rejectLimitPerDay ?? 5),
    priority: String(policy?.priority ?? 0),
    brandIds: policy?.brandIds ?? [],
    notes: policy?.notes ?? "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleBrand(brandId: string) {
    setForm((current) => ({
      ...current,
      brandIds: current.brandIds.includes(brandId) ? current.brandIds.filter((id) => id !== brandId) : [...current.brandIds, brandId],
    }));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateDealerPolicy({
        dealerId: data.dealer.id,
        minOrderAmount: form.minOrderAmount,
        maxOrderAmount: form.maxOrderAmount,
        priceLevel: form.priceLevel,
        allowCrossZone: form.allowCrossZone,
        allowReject: form.allowReject,
        rejectLimitPerDay: form.rejectLimitPerDay,
        priority: form.priority,
        brandIds: form.brandIds,
        notes: form.notes,
      });
      setMessage(result.success ? result.message ?? "政策已保存" : result.error.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">最低订单金额</span>
            <input
              className="form-input"
              min={0}
              onChange={(event) => setForm((current) => ({ ...current, minOrderAmount: event.target.value }))}
              type="number"
              value={form.minOrderAmount}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">最高订单金额</span>
            <input
              className="form-input"
              min={0}
              onChange={(event) => setForm((current) => ({ ...current, maxOrderAmount: event.target.value }))}
              placeholder="不限制"
              type="number"
              value={form.maxOrderAmount}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">价格等级</span>
            <select
              className="form-input bg-white"
              onChange={(event) => setForm((current) => ({ ...current, priceLevel: event.target.value as DealerPriceLevel }))}
              value={form.priceLevel}
            >
              {(["RETAIL", "WHOLESALE", "VIP"] as const).map((level) => (
                <option key={level} value={level}>
                  {dealerPriceLevelLabels[level]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">分单优先级</span>
            <input
              className="form-input"
              min={0}
              onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              type="number"
              value={form.priority}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">每日拒单上限</span>
            <input
              className="form-input"
              min={0}
              onChange={(event) => setForm((current) => ({ ...current, rejectLimitPerDay: event.target.value }))}
              type="number"
              value={form.rejectLimitPerDay}
            />
          </label>
          <div className="space-y-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <input checked={form.allowCrossZone} onChange={(event) => setForm((current) => ({ ...current, allowCrossZone: event.target.checked }))} type="checkbox" />
              <span>允许跨区域接单</span>
            </label>
            <label className="flex items-center gap-2">
              <input checked={form.allowReject} onChange={(event) => setForm((current) => ({ ...current, allowReject: event.target.checked }))} type="checkbox" />
              <span>允许经销商拒单</span>
            </label>
          </div>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-700">政策备注</span>
            <textarea
              className="form-input min-h-24 py-3"
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="例如：仅承接宴席散单；特殊客户需业务员确认"
              value={form.notes}
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">可承接品牌</h2>
            <button className="text-xs text-slate-500 hover:text-slate-900" onClick={() => setForm((current) => ({ ...current, brandIds: [] }))} type="button">
              全部不限
            </button>
          </div>
          <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {data.brands.map((brand) => (
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700" key={brand.id}>
                <input checked={form.brandIds.includes(brand.id)} onChange={() => toggleBrand(brand.id)} type="checkbox" />
                <span>{brand.name}</span>
              </label>
            ))}
            {data.brands.length === 0 ? <p className="text-sm text-slate-500">暂无品牌数据</p> : null}
          </div>
          <p className="mt-3 text-xs text-slate-500">未勾选品牌时视为不限制；勾选后仅承接这些品牌相关订单。</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message ? <p className="text-sm text-slate-600">{message}</p> : <span />}
        <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={submit} type="button">
          <Save className="h-4 w-4" />
          保存政策
        </Button>
      </div>
    </section>
  );
}
