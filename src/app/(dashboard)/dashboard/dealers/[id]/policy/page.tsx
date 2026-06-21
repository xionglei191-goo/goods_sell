import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { dealerPriceLevelLabels } from "@/features/channel/labels";
import { DealerPolicyForm } from "@/features/channel/DealerPolicyForm";
import { getDealerPolicyPageData } from "@/features/channel/queries";
import { formatCurrency } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DealerPolicyPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getDealerPolicyPageData(id);
  if (!data) notFound();
  const policy = data.dealer.policy;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">经销商政策</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{data.dealer.shopName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.dealer.customerName} · {data.dealer.customerPhone} · {data.dealer.zone} · {data.dealer.serviceRadius}m
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/dealers">返回列表</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="接单状态" value={data.dealer.isAccepting ? "接单中" : "暂停"} tone={data.dealer.isAccepting ? "emerald" : "amber"} />
        <SummaryCard label="最低金额" value={formatCurrency(policy?.minOrderAmount ?? 0)} />
        <SummaryCard label="最高金额" value={policy?.maxOrderAmount ? formatCurrency(policy.maxOrderAmount) : "不限"} />
        <SummaryCard label="价格等级" value={policy ? dealerPriceLevelLabels[policy.priceLevel] : "未设置"} tone="blue" />
      </section>

      <DealerPolicyForm data={data} />
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" | "amber" }) {
  const color = tone === "blue" ? "text-[#b9472d]" : tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
