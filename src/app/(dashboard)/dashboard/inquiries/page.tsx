import { inquiryStatusClasses, inquiryStatusLabels, leadSceneLabels, leadSourceLabels } from "@/features/channel/labels";
import { getInquiryDashboardData } from "@/features/channel/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InquiriesPage({ searchParams }: PageProps) {
  const data = await getInquiryDashboardData(await searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">询价单</h1>
        <p className="mt-1 text-sm text-slate-500">宴席、企业团购、门店补货等非标准需求先询价，再报价转订单。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="当前筛选询价" value={String(data.summary.total)} />
        <SummaryCard label="已报价" value={String(data.summary.quotedCount)} tone="purple" />
        <SummaryCard label="已成交" value={String(data.summary.wonCount)} tone="emerald" />
      </section>

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">询价单</th>
                <th className="px-4 py-3 font-medium">场景/来源</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">预算</th>
                <th className="px-4 py-3 font-medium">业务员</th>
                <th className="px-4 py-3 font-medium">经销商</th>
                <th className="px-4 py-3 font-medium">最近报价</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((inquiry) => (
                <tr className="border-t border-slate-100 hover:bg-[var(--dashboard-control)]" key={inquiry.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{inquiry.inquiryNo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{leadSceneLabels[inquiry.scene]}</p>
                    <p className="mt-1 text-xs text-slate-400">{leadSourceLabels[inquiry.source]}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${inquiryStatusClasses[inquiry.status]}`}>{inquiryStatusLabels[inquiry.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{inquiry.contactName}</p>
                    <p className="mt-1 text-xs text-slate-500">{inquiry.contactPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inquiry.budget}</td>
                  <td className="px-4 py-3 text-slate-600">{inquiry.salesperson}</td>
                  <td className="px-4 py-3 text-slate-600">{inquiry.dealer}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{inquiry.quoteNo}</p>
                    <p className="mt-1 text-xs text-slate-400">{inquiry.quoteAmount}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{inquiry.createdAt}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    暂无询价单
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

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "purple" | "emerald" }) {
  const color = tone === "purple" ? "text-[#b9472d]" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
