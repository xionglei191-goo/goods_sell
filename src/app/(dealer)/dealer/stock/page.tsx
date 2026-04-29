import { AlertTriangle, Boxes, PackageCheck, Warehouse } from "lucide-react";

import { DealerStockReportForm } from "@/features/dealer/DealerStockReportForm";
import { getDealerStock } from "@/features/dealer/queries";

export const dynamic = "force-dynamic";

export default async function DealerStockPage() {
  const data = await getDealerStock();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">库存上报</h1>
        <p className="mt-1 text-sm text-slate-500">分单会优先匹配库存覆盖订单商品的经销商</p>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <StatCard icon={Boxes} label="商品" value={String(data.summary.productCount)} />
        <StatCard icon={PackageCheck} label="已上报" value={String(data.summary.reportedCount)} tone="blue" />
        <StatCard icon={Warehouse} label="可售库存" value={String(data.summary.totalStock)} tone="emerald" />
        <StatCard icon={AlertTriangle} label="低库存" value={String(data.summary.lowCount)} tone="amber" />
      </section>

      <section className="space-y-3">
        {data.rows.map((row) => (
          <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200" key={row.productId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{row.name}</p>
                <p className="mt-1 text-xs text-slate-500">{row.brand} · {row.category} · {row.spec}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">{row.sku}</p>
              </div>
              <span className={row.dealerStock > 0 ? "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500"}>
                {row.dealerStock > 0 ? "可接" : "缺货"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="门店" value={String(row.dealerStock)} />
              <MiniStat label="总仓" value={String(row.platformStock)} />
              <MiniStat label="上报" value={row.reportedAt} />
            </div>

            <div className="mt-4">
              <DealerStockReportForm initialStock={row.dealerStock} productId={row.productId} />
            </div>
          </article>
        ))}
        {data.rows.length === 0 ? <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">暂无可上报商品</div> : null}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = "slate" }: { icon: typeof Boxes; label: string; value: string; tone?: "slate" | "blue" | "amber" | "emerald" }) {
  const color = tone === "blue" ? "text-blue-700" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
