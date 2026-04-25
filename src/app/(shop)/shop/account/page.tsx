import { Bot, Home, MapPin, PackageCheck, ReceiptText, Sparkles, TicketPercent, UserRound } from "lucide-react";
import Link from "next/link";

import { getAccountOverview } from "@/features/shop/queries";

export const dynamic = "force-dynamic";

const links = [
  { href: "/shop/my-orders", label: "我的订单", icon: ReceiptText },
  { href: "/shop/coupons", label: "我的优惠券", icon: TicketPercent },
  { href: "/shop/ai-chat", label: "AI 客服", icon: Bot },
  { href: "/shop/fun", label: "趣味互动", icon: Sparkles },
  { href: "/shop/account/addresses", label: "地址管理", icon: MapPin },
  { href: "/shop/account/profile", label: "个人信息", icon: UserRound },
  { href: "/shop", label: "继续购物", icon: Home },
];

export default async function AccountPage() {
  const data = await getAccountOverview();

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-gradient-to-br from-red-700 via-red-600 to-stone-900 p-5 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-2xl font-bold">{data.customer.name.slice(0, 1)}</div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{data.customer.name}</h1>
            <p className="mt-1 text-sm text-white/75">{data.customer.phone}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-xl font-bold">{data.stats.orders}</p>
            <p className="text-xs text-white/70">订单</p>
          </div>
          <div>
            <p className="text-xl font-bold">{data.stats.pending}</p>
            <p className="text-xs text-white/70">待处理</p>
          </div>
          <div>
            <p className="text-xl font-bold">{data.stats.completed}</p>
            <p className="text-xs text-white/70">已完成</p>
          </div>
          <div>
            <p className="text-xl font-bold">{data.customer.points}</p>
            <p className="text-xs text-white/70">积分</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-md" href={item.href} key={item.href}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-[#dc2626]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="mt-3 block font-semibold text-stone-950">{item.label}</span>
            </Link>
          );
        })}
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center gap-3">
          <PackageCheck className="h-5 w-5 text-[#dc2626]" />
          <div>
            <h2 className="font-bold text-stone-950">湘潭本地配送</h2>
            <p className="mt-1 text-sm text-stone-500">订单可进入总仓履约或智能分单，优惠券会在结算时自动匹配。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
