import { inquiryStatusLabels, leadSceneLabels, quoteStatusClasses, quoteStatusLabels } from "@/features/channel/labels";
import { QuoteConvertButton } from "@/features/channel/QuoteConvertButton";
import { QuoteCreateForm } from "@/features/channel/QuoteCreateForm";
import { getQuoteDashboardData, getQuoteFormOptions } from "@/features/channel/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuotesPage({ searchParams }: PageProps) {
  const [data, options] = await Promise.all([getQuoteDashboardData(await searchParams), getQuoteFormOptions()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">报价单</h1>
        <p className="mt-1 text-sm text-slate-500">把询价需求沉淀为可追踪的报价单，后续承接转订单和成交复盘。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="当前筛选报价" value={String(data.summary.total)} />
        <SummaryCard label="已发送" value={String(data.summary.sentCount)} tone="blue" />
        <SummaryCard label="已接受" value={String(data.summary.acceptedCount)} tone="emerald" />
        <SummaryCard label="已转订单" value={String(data.summary.convertedCount)} tone="purple" />
      </section>

      <QuoteCreateForm options={options} />

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">报价单</th>
                <th className="px-4 py-3 font-medium">询价单</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">场景</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">有效期</th>
                <th className="px-4 py-3 font-medium">创建人</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((quote) => (
                <tr className="border-t border-slate-100 hover:bg-[var(--dashboard-control)]" key={quote.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{quote.quoteNo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{quote.inquiryNo}</p>
                    <p className="mt-1 text-xs text-slate-400">{inquiryStatusLabels[quote.inquiryStatus]}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{quote.contactName}</p>
                    <p className="mt-1 text-xs text-slate-500">{quote.contactPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{leadSceneLabels[quote.scene]}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${quoteStatusClasses[quote.status]}`}>{quoteStatusLabels[quote.status]}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{quote.totalAmount}</td>
                  <td className="px-4 py-3 text-slate-600">{quote.validUntil}</td>
                  <td className="px-4 py-3 text-slate-600">{quote.creator}</td>
                  <td className="px-4 py-3 text-slate-500">{quote.createdAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <QuoteConvertButton
                        canConvert={quote.canConvert}
                        convertedOrderId={quote.convertedOrderId}
                        disabledReason={quote.convertDisabledReason}
                        quoteId={quote.id}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={10}>
                    暂无报价单
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

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" | "purple" }) {
  const color = tone === "blue" ? "text-[#b9472d]" : tone === "emerald" ? "text-emerald-700" : tone === "purple" ? "text-[#b9472d]" : "text-slate-900";
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
