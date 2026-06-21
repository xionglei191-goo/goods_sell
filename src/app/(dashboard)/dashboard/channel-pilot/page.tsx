import { DealerPilotBinder } from "@/features/salespeople/DealerPilotBinder";
import { getDealerPilotData } from "@/features/salespeople/queries";

export const dynamic = "force-dynamic";

export default async function ChannelPilotPage() {
  const data = await getDealerPilotData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">地推试点绑定</h1>
        <p className="mt-1 text-sm text-slate-500">为业务员绑定 10-30 个试点经销商，并批量生成业务员地推码和经销商门店码。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="业务员" value={`${data.summary.activeSalespeople}/${data.summary.salespeople}`} />
        <SummaryCard label="经销商" value={String(data.summary.dealers)} />
        <SummaryCard label="已绑定" value={String(data.summary.assignedDealers)} tone="emerald" />
        <SummaryCard label="未绑定" value={String(data.summary.unassignedDealers)} tone="amber" />
        <SummaryCard label="有效推广码" value={String(data.summary.activeCodes)} tone="blue" />
      </section>

      <DealerPilotBinder data={data} />

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">业务员试点概览</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">业务员</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">绑定经销商</th>
                <th className="px-4 py-3 font-medium">推广码</th>
                <th className="px-4 py-3 font-medium">扫码</th>
                <th className="px-4 py-3 font-medium">线索</th>
                <th className="px-4 py-3 font-medium">订单</th>
              </tr>
            </thead>
            <tbody>
              {data.salespeople.map((person) => (
                <tr className="border-t border-slate-100 hover:bg-[var(--dashboard-control)]" key={person.id}>
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
                    <span className={person.assignedDealerCount >= 10 ? "font-medium text-emerald-700" : "font-medium text-slate-900"}>{person.assignedDealerCount}</span>
                    <span className="ml-1 text-xs text-slate-400">/ 10-30</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{person.codeCount}</td>
                  <td className="px-4 py-3 text-slate-600">{person.scans}</td>
                  <td className="px-4 py-3 text-slate-600">{person.leads}</td>
                  <td className="px-4 py-3 text-slate-600">{person.orders}</td>
                </tr>
              ))}
              {data.salespeople.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>
                    暂无业务员
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

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" | "amber" }) {
  const color =
    tone === "blue" ? "text-[#b9472d]" : tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
