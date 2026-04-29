"use client";

import { useState, useTransition } from "react";

import {
  approveDealerApplication,
  rejectDealerApplication,
  type ApproveDealerApplicationInput,
} from "@/features/dealers/actions";

type SalespersonOption = {
  id: string;
  name: string;
};

type DealerApplicationReviewFormProps = {
  application: {
    id: string;
    shopName: string;
    zone: string;
    businessLicense: string;
  };
  salespeople: SalespersonOption[];
};

export function DealerApplicationReviewForm({ application, salespeople }: DealerApplicationReviewFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove(formData: FormData) {
    setMessage(null);
    setError(null);
    const input: ApproveDealerApplicationInput = {
      leadId: application.id,
      shopName: String(formData.get("shopName") ?? ""),
      zone: String(formData.get("zone") ?? ""),
      latitude: Number(formData.get("latitude")),
      longitude: Number(formData.get("longitude")),
      serviceRadius: Number(formData.get("serviceRadius") || 3000),
      businessLicense: String(formData.get("businessLicense") ?? ""),
      salesPersonId: String(formData.get("salesPersonId") ?? "") || undefined,
      notes: String(formData.get("notes") ?? ""),
    };

    startTransition(async () => {
      const result = await approveDealerApplication(input);
      if (result.success) {
        setMessage(result.message ?? "已通过");
      } else {
        setError(result.error.message);
      }
    });
  }

  function handleReject(formData: FormData) {
    setMessage(null);
    setError(null);
    const reason = String(formData.get("rejectReason") ?? "");
    startTransition(async () => {
      const result = await rejectDealerApplication({ leadId: application.id, reason });
      if (result.success) {
        setMessage(result.message ?? "已驳回");
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-3">
      <form action={handleApprove} className="grid gap-3 md:grid-cols-2">
        <input name="shopName" type="hidden" value={application.shopName} />
        <input name="businessLicense" type="hidden" value={application.businessLicense} />
        <label className="space-y-1 text-xs text-slate-500">
          区域
          <input
            className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-blue-400"
            defaultValue={application.zone}
            name="zone"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500">
          服务半径
          <input
            className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-blue-400"
            defaultValue={3000}
            min={500}
            name="serviceRadius"
            type="number"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500">
          纬度
          <input
            className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-blue-400"
            name="latitude"
            placeholder="27.83"
            step="0.000001"
            type="number"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500">
          经度
          <input
            className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-blue-400"
            name="longitude"
            placeholder="112.94"
            step="0.000001"
            type="number"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
          归属业务员
          <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400" name="salesPersonId">
            <option value="">暂不分配</option>
            {salespeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-slate-500 md:col-span-2">
          审核备注
          <input className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm text-slate-700 outline-none focus:border-blue-400" name="notes" />
        </label>
        <button className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isPending} type="submit">
          通过并开通
        </button>
      </form>

      <form action={handleReject} className="flex gap-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-red-400"
          name="rejectReason"
          placeholder="驳回原因"
        />
        <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" disabled={isPending} type="submit">
          驳回
        </button>
      </form>

      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
