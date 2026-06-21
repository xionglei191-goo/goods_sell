import type { ProductPushStatus } from "@prisma/client";

import { ProductPushEventButton } from "@/features/marketing/ProductPushEventButton";
import { ProductPushForm } from "@/features/marketing/ProductPushForm";
import { getProductPushDashboardData } from "@/features/marketing/queries";

export const dynamic = "force-dynamic";

const statusLabels: Record<ProductPushStatus, string> = {
  DRAFT: "草稿",
  SENT: "已发送",
  OPENED: "已打开",
  CLICKED: "有互动",
  CONVERTED: "已转化",
  CANCELLED: "已取消",
};

const statusClasses: Record<ProductPushStatus, string> = {
  DRAFT: "bg-[var(--dashboard-transaction-soft)] text-slate-600",
  SENT: "bg-[var(--dashboard-transaction-soft)] text-[#b9472d]",
  OPENED: "bg-cyan-50 text-cyan-700",
  CLICKED: "bg-amber-50 text-amber-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-[var(--dashboard-transaction-soft)] text-slate-500",
};

export default async function ProductPushesPage() {
  const data = await getProductPushDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">新品推送</h1>
        <p className="mt-1 text-sm text-slate-500">按画像或客户分层筛选客户，生成话术并记录打开、咨询、试饮、下单、复购和复盘建议。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-6">
        <SummaryCard label="推送记录" value={String(data.summary.total)} />
        <SummaryCard label="打开率" value={data.summary.openRate} tone="blue" />
        <SummaryCard label="咨询/试饮" value={`${data.summary.consulted}/${data.summary.trial}`} tone="amber" />
        <SummaryCard label="下单/复购" value={`${data.summary.ordered}/${data.summary.repurchase}`} tone="emerald" />
        <SummaryCard label="转化率" value={data.summary.orderRate} tone="emerald" />
        <SummaryCard label="已取消" value={String(data.summary.cancelled)} />
      </section>

      <ProductPushForm products={data.form.products} targetTags={data.form.targetTags} />

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">新品推送复盘</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">新品 / 人群</th>
                <th className="px-4 py-3 font-medium">触达</th>
                <th className="px-4 py-3 font-medium">打开</th>
                <th className="px-4 py-3 font-medium">咨询</th>
                <th className="px-4 py-3 font-medium">试饮</th>
                <th className="px-4 py-3 font-medium">下单</th>
                <th className="px-4 py-3 font-medium">复购</th>
                <th className="px-4 py-3 font-medium">转化率</th>
                <th className="px-4 py-3 font-medium">下一步</th>
              </tr>
            </thead>
            <tbody>
              {data.reviews.map((review) => (
                <tr className="border-t border-slate-100 hover:bg-[var(--dashboard-control)]" key={`${review.productName}-${review.targetTag}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{review.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">{review.targetTag}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{review.total}</td>
                  <td className="px-4 py-3 text-slate-600">{review.opened} · {review.openRate}</td>
                  <td className="px-4 py-3 text-slate-600">{review.consulted}</td>
                  <td className="px-4 py-3 text-slate-600">{review.trial}</td>
                  <td className="px-4 py-3 text-slate-600">{review.ordered}</td>
                  <td className="px-4 py-3 text-slate-600">{review.repurchase}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{review.conversionRate}</td>
                  <td className="px-4 py-3 text-slate-600">{review.nextAction}</td>
                </tr>
              ))}
              {data.reviews.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    暂无可复盘的新品推送
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">新品</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">画像</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">话术</th>
                <th className="px-4 py-3 font-medium">关键时间</th>
                <th className="px-4 py-3 font-medium">最新事件</th>
                <th className="px-4 py-3 text-right font-medium">记录</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr className="border-t border-slate-100 align-top hover:bg-[var(--dashboard-control)]" key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.productMeta}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.customerName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{item.targetTag}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.targetSource}</p>
                    <div className="mt-2 flex max-w-64 flex-wrap gap-1">
                      {item.matchedLabels.map((label) => (
                        <span className="rounded-full bg-[var(--dashboard-transaction-soft)] px-2 py-1 text-xs text-slate-500" key={label}>{label}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${statusClasses[item.status]}`}>{statusLabels[item.status]}</span>
                  </td>
                  <td className="max-w-sm px-4 py-3 text-slate-600">{item.message}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <p>发送：{item.sentAt}</p>
                    <p className="mt-1">打开：{item.openedAt}</p>
                    <p className="mt-1">互动：{item.clickedAt}</p>
                    <p className="mt-1">转化：{item.convertedAt}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.latestEvent}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ProductPushEventButton event="OPENED" id={item.id} label="打开" />
                      <ProductPushEventButton event="CONSULTED" id={item.id} label="咨询" />
                      <ProductPushEventButton event="TRIAL" id={item.id} label="试饮" />
                      <ProductPushEventButton event="ORDERED" id={item.id} label="下单" />
                      <ProductPushEventButton event="REPURCHASED" id={item.id} label="复购" />
                      <ProductPushEventButton event="CANCELLED" id={item.id} label="取消" />
                    </div>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                    暂无新品推送记录
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

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "amber" | "emerald" }) {
  const color = tone === "blue" ? "text-[#b9472d]" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
