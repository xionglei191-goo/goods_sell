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
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-50 text-blue-700",
  OPENED: "bg-cyan-50 text-cyan-700",
  CLICKED: "bg-amber-50 text-amber-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default async function ProductPushesPage() {
  const data = await getProductPushDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">新品推送</h1>
        <p className="mt-1 text-sm text-slate-500">按画像筛选客户，记录打开、咨询、试饮、下单和复购。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="推送记录" value={String(data.summary.total)} />
        <SummaryCard label="已打开" value={String(data.summary.opened)} tone="blue" />
        <SummaryCard label="咨询/试饮" value={`${data.summary.consulted}/${data.summary.trial}`} tone="amber" />
        <SummaryCard label="下单/复购" value={`${data.summary.ordered}/${data.summary.repurchase}`} tone="emerald" />
      </section>

      <ProductPushForm products={data.form.products} targetTags={data.form.targetTags} />

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
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
                <tr className="border-t border-slate-100 align-top hover:bg-slate-50" key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.productMeta}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.customerName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.targetTag}</td>
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
  const color = tone === "blue" ? "text-blue-700" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
