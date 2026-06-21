"use client";

import { Link2, QrCode, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { bindDealerPilot } from "@/features/salespeople/actions";
import type { DealerPilotData } from "@/features/salespeople/queries";

type DealerPilotBinderProps = {
  data: DealerPilotData;
};

export function DealerPilotBinder({ data }: DealerPilotBinderProps) {
  const router = useRouter();
  const activeSalespeople = useMemo(() => data.salespeople.filter((person) => person.isActive), [data.salespeople]);
  const [salespersonId, setSalespersonId] = useState(activeSalespeople[0]?.id ?? "");
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [generateSalespersonCode, setGenerateSalespersonCode] = useState(true);
  const [generateDealerCodes, setGenerateDealerCodes] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedSalesperson = data.salespeople.find((person) => person.id === salespersonId);
  const canSubmit = Boolean(salespersonId && selectedDealerIds.length > 0 && selectedDealerIds.length <= 30);

  function toggleDealer(dealerId: string) {
    setSelectedDealerIds((current) => {
      if (current.includes(dealerId)) return current.filter((id) => id !== dealerId);
      if (current.length >= 30) return current;
      return [...current, dealerId];
    });
  }

  function selectUnassigned() {
    setSelectedDealerIds(data.dealers.filter((dealer) => !dealer.salespersonId).slice(0, 30).map((dealer) => dealer.id));
  }

  function selectCurrentSalespersonDealers() {
    if (!salespersonId) return;
    setSelectedDealerIds(data.dealers.filter((dealer) => dealer.salespersonId === salespersonId).slice(0, 30).map((dealer) => dealer.id));
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await bindDealerPilot({
        salespersonId,
        dealerIds: selectedDealerIds,
        generateSalespersonCode,
        generateDealerCodes,
      });
      setMessage(result.success ? result.message ?? "试点绑定已完成" : result.error.message);
      if (result.success) {
        setSelectedDealerIds([]);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="grid gap-3 xl:w-80">
          <select
            className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]"
            onChange={(event) => setSalespersonId(event.target.value)}
            value={salespersonId}
          >
            {activeSalespeople.length === 0 ? <option value="">暂无启用业务员</option> : null}
            {activeSalespeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.phone}
              </option>
            ))}
          </select>
          <div className="rounded-md bg-[var(--dashboard-control)] p-3 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{selectedSalesperson?.name ?? "选择业务员"}</p>
            <p className="mt-2">已绑定经销商：{selectedSalesperson?.assignedDealerCount ?? 0}</p>
            <p className="mt-1">业务员推广码：{selectedSalesperson?.codeCount ?? 0}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input checked={generateSalespersonCode} className="h-4 w-4 rounded border-slate-300" onChange={(event) => setGenerateSalespersonCode(event.target.checked)} type="checkbox" />
            生成业务员地推码
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input checked={generateDealerCodes} className="h-4 w-4 rounded border-slate-300" onChange={(event) => setGenerateDealerCodes(event.target.checked)} type="checkbox" />
            生成经销商门店码
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={isPending} onClick={selectUnassigned} size="sm" type="button" variant="outline">
              <Link2 className="h-4 w-4" />
              未绑定
            </Button>
            <Button disabled={isPending || !salespersonId} onClick={selectCurrentSalespersonDealers} size="sm" type="button" variant="outline">
              <RotateCcw className="h-4 w-4" />
              当前名下
            </Button>
          </div>
          <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending || !canSubmit} onClick={submit} type="button">
            <QrCode className="h-4 w-4" />
            绑定并生成码
          </Button>
          <p className="text-xs text-slate-500">已选 {selectedDealerIds.length}/30 个经销商</p>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-[var(--dashboard-line)]">
          <div className="grid grid-cols-[44px_1.4fr_1fr_1fr_1fr] bg-[var(--dashboard-control)] px-3 py-2 text-xs font-medium text-slate-500">
            <span />
            <span>经销商</span>
            <span>当前业务员</span>
            <span>推广码</span>
            <span>转化</span>
          </div>
          <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
            {data.dealers.map((dealer) => (
              <label className="grid cursor-pointer grid-cols-[44px_1.4fr_1fr_1fr_1fr] items-center gap-0 px-3 py-3 text-sm hover:bg-[var(--dashboard-control)]" key={dealer.id}>
                <input
                  checked={selectedDealerIds.includes(dealer.id)}
                  className="h-4 w-4 rounded border-slate-300"
                  onChange={() => toggleDealer(dealer.id)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{dealer.shopName}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {dealer.customerName} · {dealer.customerPhone} · {dealer.zone}
                  </span>
                </span>
                <span className={dealer.salespersonId ? "text-slate-600" : "text-amber-700"}>{dealer.salespersonName}</span>
                <span className="text-slate-600">
                  {dealer.generalCode ?? "待生成"}
                  <span className="ml-2 text-xs text-slate-400">{dealer.codeCount} 个</span>
                </span>
                <span className="text-xs text-slate-500">
                  扫码 {dealer.scans} · 线索 {dealer.leads} · 订单 {dealer.orders}
                </span>
              </label>
            ))}
            {data.dealers.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-500">暂无经销商数据</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
