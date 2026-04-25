import { TicketPercent } from "lucide-react";
import Link from "next/link";

import { getMyCoupons } from "@/features/marketing/queries";
import { formatCouponBenefit, formatCurrency } from "@/features/shop/utils";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  UNUSED: "未使用",
  USED: "已使用",
  EXPIRED: "已过期",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export default async function ShopCouponsPage() {
  const coupons = await getMyCoupons();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-stone-950">我的优惠券</h1>
        <p className="mt-1 text-sm text-stone-500">可在下单结算时选择使用</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {coupons.map((item) => (
          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-stone-200" key={item.id}>
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#dc2626]">
                <TicketPercent className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-stone-950">{item.coupon.name}</h2>
                    <p className="mt-1 text-sm text-[#dc2626]">{formatCouponBenefit(item.coupon)}</p>
                  </div>
                  <span className={item.status === "UNUSED" ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-500"}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p className="mt-3 text-sm text-stone-600">满 {formatCurrency(item.coupon.threshold)} 可用</p>
                <p className="mt-1 text-xs text-stone-400">有效期 {formatDate(item.coupon.startsAt)} - {formatDate(item.coupon.endsAt)}</p>
              </div>
            </div>
            {item.status === "UNUSED" ? (
              <Link className="block border-t border-stone-100 px-4 py-3 text-center text-sm font-medium text-[#dc2626]" href="/shop/catalog">
                去使用
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      {coupons.length === 0 ? (
        <div className="rounded-lg bg-white px-4 py-16 text-center shadow-sm ring-1 ring-stone-200">
          <h2 className="text-lg font-bold text-stone-950">暂无优惠券</h2>
          <p className="mt-2 text-sm text-stone-500">参与活动后，优惠券会出现在这里。</p>
          <Link className="mt-5 inline-flex h-10 items-center rounded-md bg-[#dc2626] px-4 text-sm font-medium text-white" href="/shop">
            返回商城首页
          </Link>
        </div>
      ) : null}
    </div>
  );
}
