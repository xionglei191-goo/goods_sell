import type { Metadata } from "next";
import { Building2, Cookie, CupSoda, Gift, Handshake, PartyPopper, Store, Wine } from "lucide-react";
import Link from "next/link";

import { AlcoholComplianceNotice } from "@/features/shop/AlcoholComplianceNotice";
import { HeroCarousel } from "@/features/shop/HeroCarousel";
import { ProductCard } from "@/features/shop/ProductCard";
import { getShopHomeData } from "@/features/shop/queries";
import type { ShopCategorySlug } from "@/features/shop/types";

export const metadata: Metadata = {
  title: "华启商城 — 湘潭本地酒水食品配送",
  description: "华启商城提供湘潭本地酒类、食品、饮料等商品，支持在线下单、同城配送。品质保障，送货上门。",
};

export const dynamic = "force-dynamic";

const categoryIcons: Record<Exclude<ShopCategorySlug, "all">, typeof Wine> = {
  wine: Wine,
  food: Cookie,
  drink: CupSoda,
};

const sceneCards = [
  {
    title: "我要宴席配酒",
    desc: "婚宴、寿宴、升学宴先询价再报价",
    href: "/shop/scenes/banquet",
    icon: PartyPopper,
  },
  {
    title: "我要企业团购",
    desc: "福利、节礼、商务送礼和开票配送",
    href: "/shop/scenes/group-buy",
    icon: Building2,
  },
  {
    title: "我是门店补货",
    desc: "烟酒店、小超市、餐饮店补货组合",
    href: "/shop/scenes/restock",
    icon: Store,
  },
  {
    title: "经销商/业务员",
    desc: "小单回流经销商，大单公司统筹",
    href: "/shop/channel",
    icon: Handshake,
  },
];

export default async function ShopPage() {
  const data = await getShopHomeData();

  return (
    <div className="space-y-8">
      <section className="rounded-lg bg-stone-950 p-6 text-white">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm text-white/65">湘潭区域总代供货</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">酒水饮料供应与智能订货平台</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/78">
              面向宴席客户、企业团购、门店补货、下游经销商和普通散客。小额订单优先就近经销商履约，大额团购和企业采购由公司或业务员统一报价。
            </p>
          </div>
          <div className="rounded-lg bg-white/8 p-4 ring-1 ring-white/15">
            <p className="text-sm font-medium text-white">渠道保护机制</p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              平台不抢经销商小单；客户通过业务员或门店二维码进入后，线索来源会被记录，后续分单、报价、配送和复购都可追踪。
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sceneCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link className="shop-block-card p-4 transition hover:-translate-y-0.5 hover:shadow-md" href={card.href} key={card.href}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-[#dc2626]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="mt-4 block font-semibold text-stone-950">{card.title}</span>
              <span className="mt-1 block text-sm leading-5 text-stone-500">{card.desc}</span>
            </Link>
          );
        })}
      </section>

      <HeroCarousel banners={data.banners} />

      <section className="shop-block-card p-4">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 text-[#dc2626]" />
          <div>
            <h2 className="font-semibold text-stone-950">场景化订货优先</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">宴席、企业团购和门店补货建议先提交询价，普通小单可继续走商品目录、购物车和在线支付。</p>
          </div>
        </div>
      </section>

      <AlcoholComplianceNotice />

      <section>
        <div className="grid grid-cols-3 gap-3">
          {data.categories.map((category) => {
            const Icon = categoryIcons[category.slug as Exclude<ShopCategorySlug, "all">];
            const tone =
              category.slug === "wine"
                ? "bg-red-50 text-red-700 ring-red-100"
                : category.slug === "food"
                  ? "bg-orange-50 text-orange-700 ring-orange-100"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-100";
            return (
              <Link className="shop-block-card p-4 text-center" href={`/shop/catalog?category=${category.slug}`} key={category.slug}>
                <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-md ring-1 ${tone}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="mt-2 block text-sm font-semibold text-neutral-950">{category.label}</span>
                <span className="mt-1 block text-xs text-neutral-400">{category.count} 件</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-950">猜你喜欢</h2>
            <p className="mt-1 text-sm text-neutral-500">{data.recommendationReason}</p>
          </div>
          <Link className="text-sm font-medium shop-promo-accent" href="/shop/fun">
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
            <h2 className="text-xl font-bold text-neutral-950">热门推荐</h2>
            <p className="mt-1 text-sm text-neutral-500">按销量优先展示</p>
          </div>
          <Link className="text-sm font-medium shop-promo-accent" href="/shop/catalog?sort=sales">
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
            <h2 className="text-xl font-bold text-neutral-950">新品上架</h2>
            <p className="mt-1 text-sm text-neutral-500">最近补充的本地供应商品</p>
          </div>
          <Link className="text-sm font-medium commerce-accent" href="/shop/catalog?sort=new">
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
