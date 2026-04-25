import Link from "next/link";

import { CouponForm } from "@/features/marketing/CouponForm";

export const dynamic = "force-dynamic";

export default function NewCouponPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm font-medium text-blue-600" href="/dashboard/marketing/coupons">
          返回优惠券管理
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">新建优惠券</h1>
        <p className="mt-1 text-sm text-slate-500">支持满减券、折扣券、使用门槛和有效期配置</p>
      </div>
      <CouponForm />
    </div>
  );
}
