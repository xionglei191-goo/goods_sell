import Link from "next/link";

import { MarketingCharts } from "@/features/marketing/MarketingCharts";
import { getMarketingOperations } from "@/features/marketing/queries";
import { formatCurrency } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

const lifecycleLabels: Record<string, string> = {
  NEW: "新客",
  ACTIVE: "活跃",
  SILENT: "沉默",
  LOST: "流失",
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function MarketingOperationsPage() {
  const data = await getMarketingOperations();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">运营营销看板</h1>
          <p className="mt-1 text-sm text-neutral-500">用户增长、活跃、画像标签和优惠券转化</p>
        </div>
        <Link className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white" href="/dashboard/marketing/coupons">
          管理优惠券
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">总客户数</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{data.summary.totalCustomers}</p>
          <p className="mt-1 text-xs text-neutral-500">本月新增 {data.summary.monthNewCustomers}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">DAU / MAU</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{data.summary.dau} / {data.summary.mau}</p>
          <p className="mt-1 text-xs text-neutral-500">订单、聊天、签到计入活跃</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">AI 咨询 30 天</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{data.summary.aiChats30d}</p>
          <p className="mt-1 text-xs text-neutral-500">按用户消息统计</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">优惠券核销率</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{formatPercent(data.summary.couponUseRate)}</p>
          <p className="mt-1 text-xs text-neutral-500">带券销售 {formatCurrency(data.summary.couponRevenue)}</p>
        </div>
      </section>

      <MarketingCharts growth={data.growth} tags={data.tags} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">生命周期分布</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {data.lifecycle.map((item) => (
              <div className="rounded-md bg-orange-50 px-3 py-3" key={item.name}>
                <p className="text-sm text-neutral-500">{lifecycleLabels[item.name] ?? item.name}</p>
                <p className="mt-2 text-xl font-bold text-neutral-950">{item.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">优惠券投放效果</h2>
          <div className="mt-4 space-y-3">
            {data.coupons.map((coupon) => (
              <div className="rounded-md bg-orange-50 px-3 py-2 text-sm" key={coupon.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-neutral-950">{coupon.name}</span>
                  <span className={coupon.isActive ? "text-emerald-700" : "text-neutral-400"}>{coupon.isActive ? "启用" : "停用"}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">发放 {coupon.issued} · 持有 {coupon.holders} · 核销 {coupon.used}</p>
              </div>
            ))}
            {data.coupons.length === 0 ? <p className="text-sm text-neutral-500">暂无优惠券投放数据</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
