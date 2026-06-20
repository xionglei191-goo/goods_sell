import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ProfileRefreshButton } from "@/features/ai/ProfileRefreshButton";
import { ProfileTrendChart } from "@/features/ai/ProfileCharts";
import { customerSegmentClasses, customerSegmentLabels } from "@/features/customers/segmentation";
import { getCustomerDetail } from "@/features/customers/queries";
import { formatCurrency, formatDateTime, orderStatusClasses, orderStatusLabels } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

const typeLabels = {
  CONSUMER: "消费者",
  DEALER: "经销商",
};

type ProfileMeta = {
  labels?: string[];
  monthlyAverage?: number;
  trend?: Array<{ month: string; amount: number }>;
  topProducts?: Array<{ name: string; amount: number; quantity: number }>;
};

function getProfileMeta(value: unknown): ProfileMeta {
  if (!value || typeof value !== "object") return {};
  return value as ProfileMeta;
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const data = await getCustomerDetail(id);
  const profileMeta = getProfileMeta(data.customer.profile?.tags);
  const profileLabels = profileMeta.labels ?? [];
  const trend = profileMeta.trend ?? [];
  const topProducts = profileMeta.topProducts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">{data.customer.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{typeLabels[data.customer.type]} · {data.customer.phone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProfileRefreshButton customerId={data.customer.id} />
          <Button asChild variant="outline">
            <Link href="/dashboard/customers">返回列表</Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">总消费</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{formatCurrency(data.stats.totalSpent)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">平均客单</p>
          <p className="mt-2 text-2xl font-bold text-neutral-950">{formatCurrency(data.stats.avgOrderAmount)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">欠款</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{formatCurrency(data.stats.debt)}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">最近购买</p>
          <p className="mt-2 font-semibold text-neutral-950">{data.stats.lastOrderAt ? formatDateTime(data.stats.lastOrderAt) : "-"}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">基础档案</h2>
          <div className="mt-4 space-y-3 text-sm text-neutral-600">
            <p>所属销售员：{data.customer.salesPerson?.name ?? "未分配"}</p>
            <p>积分：{data.customer.points}</p>
            <p>信用额度：{formatCurrency(data.customer.creditLimit)}</p>
            {data.customer.dealer ? <p>经销区域：{data.customer.dealer.zone} · 服务半径 {data.customer.dealer.serviceRadius}m</p> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.customer.tags.map((tag) => (
              <span className="rounded-full px-2 py-1 text-xs" style={{ backgroundColor: tag.color ?? "#f1f5f9", color: "#334155" }} key={tag.id}>
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">用户画像</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-orange-50 p-3">
              <p className="text-neutral-500">消费能力</p>
              <p className="mt-1 font-semibold text-neutral-950">{data.customer.profile?.spendingLevel ?? "待分析"}</p>
            </div>
            <div className="rounded-md bg-orange-50 p-3">
              <p className="text-neutral-500">购买频次</p>
              <p className="mt-1 font-semibold text-neutral-950">{data.customer.profile?.purchaseFrequency ?? "待分析"}</p>
            </div>
            <div className="rounded-md bg-orange-50 p-3">
              <p className="text-neutral-500">生命周期</p>
              <p className="mt-1 font-semibold text-neutral-950">{data.customer.profile?.lifecycle ?? "待分析"}</p>
            </div>
            <div className="rounded-md bg-orange-50 p-3">
              <p className="text-neutral-500">最近分析</p>
              <p className="mt-1 font-semibold text-neutral-950">{data.customer.profile?.lastAnalyzedAt ? formatDateTime(data.customer.profile.lastAnalyzedAt) : "Phase 4"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={cn("rounded-full px-2 py-1 text-xs font-medium", customerSegmentClasses[data.customer.segment])}>{customerSegmentLabels[data.customer.segment]}</span>
            {profileLabels.length > 0 ? profileLabels.map((label) => (
              <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700" key={label}>{label}</span>
            )) : <span className="text-sm text-neutral-500">点击刷新画像生成标签</span>}
          </div>
          <p className="mt-3 text-sm text-slate-600">{data.customer.nextAction}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">近 6 个月消费趋势</h2>
          {trend.length > 0 ? <ProfileTrendChart data={trend} /> : <p className="mt-4 text-sm text-neutral-500">暂无趋势数据，请刷新画像。</p>}
        </div>
        <div className="surface-panel p-5">
          <h2 className="text-lg font-semibold text-neutral-950">最常购买 TOP5</h2>
          <div className="mt-4 space-y-3">
            {topProducts.map((product, index) => (
              <div className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2 text-sm" key={product.name}>
                <span>{index + 1}. {product.name} · {product.quantity} 件</span>
                <span className="font-semibold text-neutral-950">{formatCurrency(product.amount)}</span>
              </div>
            ))}
            {topProducts.length === 0 ? <p className="text-sm text-neutral-500">暂无商品偏好数据。</p> : null}
          </div>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">地址</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {data.addresses.map((address) => (
            <div className="rounded-md border p-3 text-sm" key={address.id} style={{ borderColor: "var(--dashboard-line)" }}>
              <p className="font-medium text-neutral-950">{address.name} {address.phone}{address.isDefault ? " · 默认" : ""}</p>
              <p className="mt-1 text-neutral-500">{address.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">订单历史</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-3 py-2 font-medium">订单号</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">商品数</th>
                <th className="px-3 py-2 font-medium">金额</th>
                <th className="px-3 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr className="border-t border-neutral-100" key={order.id}>
                  <td className="px-3 py-3">
                    <Link className="font-medium text-neutral-950 hover:text-orange-700" href={`/dashboard/orders/${order.id}`}>{order.orderNo}</Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[order.status])}>{orderStatusLabels[order.status]}</span>
                  </td>
                  <td className="px-3 py-3 text-neutral-600">{order.itemCount}</td>
                  <td className="px-3 py-3 font-medium text-neutral-950">{formatCurrency(order.payableAmount)}</td>
                  <td className="px-3 py-3 text-neutral-500">{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
