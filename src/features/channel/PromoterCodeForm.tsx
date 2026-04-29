"use client";

import type { LeadScene, PromoterOwnerType } from "@prisma/client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createPromoterCode } from "@/features/channel/actions";
import { leadSceneLabels, promoterOwnerTypeLabels } from "@/features/channel/labels";
import type { PromoterFormOptions } from "@/features/channel/queries";

type PromoterCodeFormProps = {
  options: PromoterFormOptions;
};

type FormState = {
  ownerType: PromoterOwnerType;
  ownerId: string;
  label: string;
  code: string;
  scene: "" | LeadScene;
};

const scenes = ["BANQUET", "GROUP_BUY", "RESTOCK", "GIFT", "NEW_PRODUCT_TRIAL", "RETAIL", "DEALER_JOIN", "OTHER"] as const;

export function PromoterCodeForm({ options }: PromoterCodeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ownerType: "SALESPERSON", ownerId: "", label: "", code: "", scene: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ownerOptions = useMemo(() => {
    if (form.ownerType === "SALESPERSON") return options.salespeople;
    if (form.ownerType === "DEALER") return options.dealers;
    return options.campaigns;
  }, [form.ownerType, options]);
  const ownerId = form.ownerId || ownerOptions[0]?.id || "";
  const canSubmit = Boolean(form.label && ownerId);

  function updateOwnerType(ownerType: PromoterOwnerType) {
    setForm((current) => ({ ...current, ownerType, ownerId: "" }));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await createPromoterCode({
        ownerType: form.ownerType,
        label: form.label,
        code: form.code,
        scene: form.scene,
        salespersonId: form.ownerType === "SALESPERSON" ? ownerId : undefined,
        dealerId: form.ownerType === "DEALER" ? ownerId : undefined,
        campaignId: form.ownerType === "CAMPAIGN" ? ownerId : undefined,
      });
      setMessage(result.success ? result.message ?? "推广码已生成" : result.error.message);
      if (result.success) {
        setForm((current) => ({ ...current, label: "", code: "" }));
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-5">
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
            onChange={(event) => updateOwnerType(event.target.value as PromoterOwnerType)}
            value={form.ownerType}
          >
            {(["SALESPERSON", "DEALER", "CAMPAIGN"] as const).map((type) => (
              <option key={type} value={type}>
                {promoterOwnerTypeLabels[type]}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 md:col-span-2"
            disabled={ownerOptions.length === 0}
            onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))}
            value={ownerId}
          >
            {ownerOptions.length === 0 ? <option value="">暂无可选归属</option> : null}
            {ownerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            placeholder="推广码名称"
            value={form.label}
          />
          <input
            className="h-10 rounded-md border border-slate-200 px-3 text-sm uppercase outline-none focus:border-blue-400"
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            placeholder="自定义码，可选"
            value={form.code}
          />
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 md:col-span-2"
            onChange={(event) => setForm((current) => ({ ...current, scene: event.target.value as "" | LeadScene }))}
            value={form.scene}
          >
            <option value="">通用场景</option>
            {scenes.map((scene) => (
              <option key={scene} value={scene}>
                {leadSceneLabels[scene]}
              </option>
            ))}
          </select>
        </div>
        <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending || !canSubmit} onClick={submit} type="button">
          <Plus className="h-4 w-4" />
          生成推广码
        </Button>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
