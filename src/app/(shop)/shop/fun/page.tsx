import Link from "next/link";

import { FunClient } from "@/features/ai/FunClient";
import { getCheckInState, getSolarTermRecommendation } from "@/features/ai/fun";
import { formatCurrency } from "@/features/shop/utils";

export const dynamic = "force-dynamic";

const seasonLabels = {
  spring: "春季",
  summer: "夏季",
  autumn: "秋季",
  winter: "冬季",
};

export default async function FunPage() {
  const [solar, checkIn] = await Promise.all([getSolarTermRecommendation(), getCheckInState()]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg bg-gradient-to-br from-red-700 via-red-600 to-stone-900 p-6 text-white">
        <p className="text-sm text-white/75">节气养生推荐</p>
        <h1 className="mt-2 text-3xl font-bold">{solar.term.name}</h1>
        <p className="mt-1 text-sm text-white/75">{seasonLabels[solar.term.season]} · 湘潭本地推荐</p>
        <p className="mt-4 max-w-2xl leading-7 text-white/90">{solar.content.advice}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-stone-950">节气相关商品</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {solar.products.map((product) => (
            <Link className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-stone-200" href={`/shop/product/${product.id}`} key={product.id}>
              <div className="flex aspect-square items-center justify-center rounded-md bg-red-50 text-2xl font-bold text-[#dc2626]">{product.name.slice(0, 1)}</div>
              <p className="mt-2 line-clamp-1 text-sm font-semibold text-stone-900">{product.name}</p>
              <p className="mt-1 text-sm font-bold text-[#dc2626]">{formatCurrency(Number(product.retailPrice))}</p>
            </Link>
          ))}
        </div>
      </section>

      <FunClient checkIn={checkIn} />
    </div>
  );
}
