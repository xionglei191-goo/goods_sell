import { leadSceneLabels, leadSourceLabels, leadStatusClasses, leadStatusLabels } from "@/features/channel/labels";
import { getLeadDashboardData } from "@/features/channel/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: PageProps) {
  const data = await getLeadDashboardData(await searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">线索池</h1>
        <p className="mt-1 text-sm text-slate-500">沉淀 AI 互动、场景询价、推广码扫码和客户入口产生的需求。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="当前筛选线索" value={String(data.summary.total)} />
        <SummaryCard label="新线索" value={String(data.summary.newCount)} tone="blue" />
        <SummaryCard label="已转化" value={String(data.summary.convertedCount)} tone="emerald" />
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">场景</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">业务员</th>
                <th className="px-4 py-3 font-medium">经销商</th>
                <th className="px-4 py-3 font-medium">推广码</th>
                <th className="px-4 py-3 font-medium">询价单</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((lead) => (
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={lead.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{lead.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{lead.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{leadSceneLabels[lead.scene]}</td>
                  <td className="px-4 py-3 text-slate-600">{leadSourceLabels[lead.source]}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${leadStatusClasses[lead.status]}`}>{leadStatusLabels[lead.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.salesperson}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.dealer}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.promoter}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.inquiryNo}</td>
                  <td className="px-4 py-3 text-slate-500">{lead.createdAt}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    暂无线索
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

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" }) {
  const color = tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
