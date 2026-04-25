import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { IssueCouponButton } from "@/features/marketing/IssueCouponButton";
import { getMarketingCoupons } from "@/features/marketing/queries";
import { formatCouponBenefit, formatCurrency } from "@/features/shop/utils";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export default async function MarketingCouponsPage() {
  const data = await getMarketingCoupons();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">优惠券管理</h1>
          <p className="mt-1 text-sm text-slate-500">创建优惠券，并按画像标签定向发放</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/marketing/coupons/new">
            <Plus className="h-4 w-4" />
            新建优惠券
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">优惠券总数</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{data.coupons.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">已发放</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">{data.coupons.reduce((sum, coupon) => sum + coupon.issuedQuantity, 0)}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">已核销</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{data.coupons.reduce((sum, coupon) => sum + coupon.usedQuantity, 0)}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">可投放标签</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{data.targetTags.length}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">优惠券</th>
                <th className="px-4 py-3">门槛</th>
                <th className="px-4 py-3">有效期</th>
                <th className="px-4 py-3">发放/核销</th>
                <th className="px-4 py-3">定向发放</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">{coupon.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatCouponBenefit(coupon)}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">满 {formatCurrency(coupon.threshold)}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(coupon.startsAt)} - {formatDate(coupon.endsAt)}</td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>{coupon.issuedQuantity}/{coupon.totalQuantity} 已发放</p>
                    <p className="mt-1 text-xs text-emerald-700">{coupon.usedQuantity} 已核销</p>
                  </td>
                  <td className="px-4 py-4">
                    {data.targetTags.length > 0 ? <IssueCouponButton couponId={coupon.id} tags={data.targetTags} /> : <span className="text-xs text-slate-400">暂无画像标签</span>}
                  </td>
                </tr>
              ))}
              {data.coupons.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={5}>暂无优惠券</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
