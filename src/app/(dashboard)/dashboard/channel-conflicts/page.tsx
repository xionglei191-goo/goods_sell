import { ChannelConflictActions } from "@/features/channel/ChannelConflictActions";
import { ChannelConflictForm } from "@/features/channel/ChannelConflictForm";
import {
  channelConflictStatusClasses,
  channelConflictStatusLabels,
  channelConflictTypeClasses,
  channelConflictTypeLabels,
} from "@/features/channel/labels";
import { getChannelConflictDashboardData, getChannelConflictFormOptions } from "@/features/channel/queries";
import { orderStatusClasses, orderStatusLabels } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const conflictTypes = ["CROSS_ZONE", "PRICE_ANOMALY", "REJECTION", "COMPLAINT", "STOCK_MISMATCH", "OTHER"] as const;
const conflictStatuses = ["OPEN", "PROCESSING", "RESOLVED", "IGNORED"] as const;

export default async function ChannelConflictsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [data, options] = await Promise.all([getChannelConflictDashboardData(params), getChannelConflictFormOptions()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">渠道冲突台账</h1>
        <p className="mt-1 text-sm text-slate-500">沉淀跨区、低价、拒单、库存和投诉异常，跟踪责任人、处理状态和关闭结果。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="当前筛选" value={String(data.summary.total)} />
        <SummaryCard label="待处理" value={String(data.summary.openCount)} tone="blue" />
        <SummaryCard label="处理中" value={String(data.summary.processingCount)} tone="amber" />
        <SummaryCard label="已解决" value={String(data.summary.resolvedCount)} tone="emerald" />
        <SummaryCard label="已忽略" value={String(data.summary.ignoredCount)} />
      </section>

      <form action="/dashboard/channel-conflicts" className="grid gap-3 rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1fr_180px_180px_auto]">
        <input
          className="h-10 rounded-md border border-[var(--dashboard-line)] px-3 text-sm outline-none focus:border-[#e86f51]"
          defaultValue={data.filters.q}
          name="q"
          placeholder="搜索摘要、订单号、客户、经销商"
        />
        <select className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]" defaultValue={data.filters.type ?? ""} name="type">
          <option value="">全部类型</option>
          {conflictTypes.map((type) => (
            <option key={type} value={type}>
              {channelConflictTypeLabels[type]}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-3 text-sm outline-none focus:border-[#e86f51]" defaultValue={data.filters.status ?? ""} name="status">
          <option value="">全部状态</option>
          {conflictStatuses.map((status) => (
            <option key={status} value={status}>
              {channelConflictStatusLabels[status]}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-[#e86f51] px-4 text-sm font-medium text-white hover:bg-[#cf5638]" type="submit">
          筛选
        </button>
      </form>

      <ChannelConflictForm options={options} />

      <section className="overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px] text-left text-sm">
            <thead className="bg-[var(--dashboard-control)] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">冲突</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">订单</th>
                <th className="px-4 py-3 font-medium">经销商</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">责任人</th>
                <th className="px-4 py-3 font-medium">最近处理</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium">处理</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((conflict) => (
                <tr className="border-t border-slate-100 align-top hover:bg-[var(--dashboard-control)]" key={conflict.id}>
                  <td className="max-w-80 px-4 py-4">
                    <span className={`rounded-full px-2 py-1 text-xs ${channelConflictTypeClasses[conflict.type]}`}>{channelConflictTypeLabels[conflict.type]}</span>
                    <p className="mt-2 font-medium text-slate-900">{conflict.summary}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{conflict.detailText}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2 py-1 text-xs ${channelConflictStatusClasses[conflict.status]}`}>{channelConflictStatusLabels[conflict.status]}</span>
                    {conflict.resolvedAt !== "-" ? <p className="mt-2 text-xs text-slate-400">{conflict.resolvedAt}</p> : null}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p className="font-medium text-slate-900">{conflict.orderNo}</p>
                    {conflict.orderStatus ? (
                      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs ${orderStatusClasses[conflict.orderStatus]}`}>{orderStatusLabels[conflict.orderStatus]}</span>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">{conflict.orderAmount}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-400">{conflict.orderAddress}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {conflict.dealer ? (
                      <>
                        <p className="font-medium text-slate-900">{conflict.dealer.shopName}</p>
                        <p className="mt-1 text-xs text-slate-500">{conflict.dealer.contact}</p>
                        <p className="mt-1 text-xs text-slate-400">{conflict.dealer.zone}</p>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {conflict.customer ? (
                      <>
                        <p className="font-medium text-slate-900">{conflict.customer.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{conflict.customer.phone}</p>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{conflict.ownerName}</td>
                  <td className="max-w-60 px-4 py-4 text-slate-600">
                    {conflict.latestEvent ? (
                      <>
                        <p className="line-clamp-2">{conflict.latestEvent.label}</p>
                        {conflict.latestEvent.at ? <p className="mt-1 text-xs text-slate-400">{conflict.latestEvent.at}</p> : null}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-500">{conflict.createdAt}</td>
                  <td className="px-4 py-4">
                    <ChannelConflictActions conflictId={conflict.id} initialOwnerId={conflict.ownerId} initialStatus={conflict.status} owners={options.owners} />
                  </td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                    暂无渠道冲突记录
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
  const color =
    tone === "blue" ? "text-[#b9472d]" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
