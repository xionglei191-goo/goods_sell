import Link from "next/link";

import { dealerPriceLevelLabels } from "@/features/channel/labels";
import { DealerApplicationReviewForm } from "@/features/dealers/DealerApplicationReviewForm";
import { dealerTierClasses, dealerTierLabels, type DealerTier } from "@/features/dealers/segmentation";
import { getDealerManagementData } from "@/features/dealers/queries";

export const dynamic = "force-dynamic";

type DealersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const tierOptions: DealerTier[] = ["ACTIVE", "STANDARD", "TO_ACTIVATE", "RISK"];

export default async function DealersPage({ searchParams }: DealersPageProps) {
  const data = await getDealerManagementData(await searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">经销商管理</h1>
        <p className="mt-1 text-sm text-slate-500">查看经销商信息、渠道政策、接单状态与动态分层。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-7">
        <SummaryCard label="经销商总数" value={String(data.summary.total)} />
        <SummaryCard label="待审核" value={String(data.summary.pendingApplications)} tone="amber" />
        <SummaryCard label="活跃" value={String(data.summary.ACTIVE)} tone="emerald" />
        <SummaryCard label="普通" value={String(data.summary.STANDARD)} tone="blue" />
        <SummaryCard label="待激活" value={String(data.summary.TO_ACTIVATE)} tone="amber" />
        <SummaryCard label="风险" value={String(data.summary.RISK)} tone="red" />
        <SummaryCard label="可接单" value={`${data.summary.accepting}/${data.summary.total}`} tone="emerald" />
      </section>

      {data.pendingApplications.length > 0 ? (
        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-amber-200">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">经销商申请审核</h2>
            <p className="mt-1 text-sm text-slate-500">审核通过后将创建正式门店档案，并开通经销商端登录。</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.pendingApplications.map((application) => (
              <article className="rounded-lg border border-slate-200 p-4" key={application.id}>
                <div className="mb-3">
                  <p className="font-medium text-slate-900">{application.shopName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {application.contactName} · {application.phone} · {application.createdAt}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {application.zone || "未填区域"} · {application.address || "未填地址"}
                  </p>
                  {application.notes ? <p className="mt-2 text-xs text-slate-500">备注：{application.notes}</p> : null}
                </div>
                <DealerApplicationReviewForm application={application} salespeople={data.salespeople} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <form action="/dashboard/dealers" className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1fr_220px_auto]">
        <input
          className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
          defaultValue={data.filters.q}
          name="q"
          placeholder="搜索店铺、联系人、电话、区域、业务员"
        />
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" defaultValue={data.filters.tier ?? ""} name="tier">
          <option value="">全部分层</option>
          {tierOptions.map((tier) => (
            <option key={tier} value={tier}>
              {dealerTierLabels[tier]}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700" type="submit">
          筛选
        </button>
      </form>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1520px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">店铺</th>
                <th className="px-4 py-3 font-medium">分层</th>
                <th className="px-4 py-3 font-medium">业务员</th>
                <th className="px-4 py-3 font-medium">区域/状态</th>
                <th className="px-4 py-3 font-medium">履约</th>
                <th className="px-4 py-3 font-medium">获客</th>
                <th className="px-4 py-3 font-medium">库存/风险</th>
                <th className="px-4 py-3 font-medium">建议动作</th>
                <th className="px-4 py-3 font-medium">渠道政策</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((dealer) => (
                <tr className="border-t border-slate-100 align-top hover:bg-slate-50" key={dealer.id}>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-900">{dealer.shopName}</p>
                    <p className="mt-1 text-xs text-slate-500">{dealer.contactName} · {dealer.contactPhone}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2 py-1 text-xs ${dealerTierClasses[dealer.tier]}`}>{dealerTierLabels[dealer.tier]}</span>
                    <div className="mt-2 space-y-1">
                      {dealer.reasons.map((reason) => (
                        <p className="text-xs text-slate-500" key={reason}>
                          {reason}
                        </p>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{dealer.salesperson}</td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>{dealer.zone} · {dealer.serviceRadius}m</p>
                    <span
                      className={
                        dealer.isAccepting
                          ? "mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                          : "mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700"
                      }
                    >
                      {dealer.isAccepting ? "接单中" : "暂停接单"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>已接 {dealer.metrics.acceptedCount} · 近30天 {dealer.metrics.recentAcceptedCount}</p>
                    <p className="mt-1 text-xs text-slate-500">拒单 {dealer.metrics.rejectedCount} · 近30天 {dealer.metrics.recentRejectedCount}</p>
                    <p className="mt-1 text-xs text-slate-400">拒单率 {dealer.metrics.rejectionRate} · {dealer.metrics.revenue}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>推广码 {dealer.metrics.activeCodeCount} · 扫码 {dealer.metrics.scanCount}</p>
                    <p className="mt-1 text-xs text-slate-500">线索 {dealer.metrics.leadCount} · 推广订单 {dealer.metrics.promoterOrderCount}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>库存品类 {dealer.metrics.availableStockCount}/{dealer.metrics.stockReportedCount}</p>
                    <p className="mt-1 text-xs text-slate-500">{dealer.metrics.latestStockAt}</p>
                    <p className={dealer.metrics.openConflictCount > 0 ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-slate-400"}>
                      未关闭冲突 {dealer.metrics.openConflictCount}
                    </p>
                  </td>
                  <td className="max-w-56 px-4 py-4 text-slate-600">{dealer.nextAction}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {dealer.policy ? (
                      <div>
                        <p>{dealerPriceLevelLabels[dealer.policy.priceLevel]} · 优先级 {dealer.policy.priority}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {dealer.policy.minOrderAmount} 起{dealer.policy.maxOrderAmount ? ` · 封顶 ${dealer.policy.maxOrderAmount}` : " · 不限上限"}
                        </p>
                        <Link className="mt-1 inline-flex text-xs font-medium text-blue-700 hover:text-blue-900" href={`/dashboard/dealers/${dealer.id}/policy`}>
                          编辑政策
                        </Link>
                      </div>
                    ) : (
                      <Link className="text-sm font-medium text-blue-700 hover:text-blue-900" href={`/dashboard/dealers/${dealer.id}/policy`}>
                        设置政策
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-500">{dealer.createdAt}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={10}>
                    暂无经销商数据
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

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" | "amber" | "red" }) {
  const color =
    tone === "blue"
      ? "text-blue-700"
      : tone === "emerald"
        ? "text-emerald-700"
        : tone === "amber"
          ? "text-amber-700"
          : tone === "red"
            ? "text-red-700"
            : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
