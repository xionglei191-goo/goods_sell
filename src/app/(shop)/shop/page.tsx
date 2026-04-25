import { Cookie, CupSoda, Wine } from "lucide-react";
import Link from "next/link";

import { HeroCarousel } from "@/features/shop/HeroCarousel";
import { ProductCard } from "@/features/shop/ProductCard";
import { getShopHomeData } from "@/features/shop/queries";
import type { ShopCategorySlug } from "@/features/shop/types";

export const dynamic = "force-dynamic";

const categoryIcons: Record<Exclude<ShopCategorySlug, "all">, typeof Wine> = {
  wine: Wine,
  food: Cookie,
  drink: CupSoda,
};

export default async function ShopPage() {
  const data = await getShopHomeData();

  return (
    <div className="space-y-8">
      <HeroCarousel banners={data.banners} />

      <section>
        <div className="grid grid-cols-3 gap-3">
          {data.categories.map((category) => {
            const Icon = categoryIcons[category.slug as Exclude<ShopCategorySlug, "all">];
            return (
              <Link className="rounded-lg bg-white p-4 text-center shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-md" href={`/shop/catalog?category=${category.slug}`} key={category.slug}>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[#dc2626]">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="mt-2 block text-sm font-semibold text-stone-900">{category.label}</span>
                <span className="mt-1 block text-xs text-stone-400">{category.count} 件</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-950">猜你喜欢</h2>
            <p className="mt-1 text-sm text-stone-500">{data.recommendationReason}</p>
          </div>
          <Link className="text-sm font-medium text-[#dc2626]" href="/shop/fun">
            做个小测试
          </Link>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {data.recommendedProducts.map((product) => (
            <div className="w-44 shrink-0 sm:w-52" key={product.id}>
              <ProductCard compact product={product} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-950">热门推荐</h2>
            <p className="mt-1 text-sm text-stone-500">按销量优先展示</p>
          </div>
          <Link className="text-sm font-medium text-[#dc2626]" href="/shop/catalog?sort=sales">
            查看更多
          </Link>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {data.hotProducts.map((product) => (
            <div className="w-44 shrink-0 sm:w-52" key={product.id}>
              <ProductCard compact product={product} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-950">新品上架</h2>
            <p className="mt-1 text-sm text-stone-500">最近补充的本地供应商品</p>
          </div>
          <Link className="text-sm font-medium text-[#dc2626]" href="/shop/catalog?sort=new">
            全部新品
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.newProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
