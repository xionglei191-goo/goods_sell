"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProductCard } from "@/features/shop/ProductCard";
import type { CatalogData, ShopCategorySlug } from "@/features/shop/types";
import { formatCurrency } from "@/features/shop/utils";
import { cn } from "@/lib/utils";

type CatalogBrowserProps = {
  data: CatalogData;
};

const sortLabels = [
  { value: "default", label: "综合" },
  { value: "price-asc", label: "价格升序" },
  { value: "price-desc", label: "价格降序" },
  { value: "sales", label: "销量优先" },
  { value: "new", label: "新品优先" },
] as const;

export function CatalogBrowser({ data }: CatalogBrowserProps) {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [category, setCategory] = useState<ShopCategorySlug>(data.filters.category);
  const [q, setQ] = useState(data.filters.q);
  const [brandIds, setBrandIds] = useState(data.filters.brandIds);
  const [minPrice, setMinPrice] = useState(data.filters.minPrice ?? data.priceBounds.min);
  const [maxPrice, setMaxPrice] = useState(data.filters.maxPrice ?? data.priceBounds.max);
  const [sort, setSort] = useState(data.filters.sort);

  const visibleProducts = data.products.slice(0, visibleCount);
  const hasMore = visibleCount < data.products.length;

  const syncKey = useMemo(() => JSON.stringify({ category, q, brandIds, minPrice, maxPrice, sort }), [brandIds, category, maxPrice, minPrice, q, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (q.trim()) params.set("q", q.trim());
      if (brandIds.length > 0) params.set("brand", brandIds.join(","));
      if (minPrice > data.priceBounds.min) params.set("minPrice", String(minPrice));
      if (maxPrice < data.priceBounds.max) params.set("maxPrice", String(maxPrice));
      if (sort !== "default") params.set("sort", sort);
      router.replace(`/shop/catalog${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [category, data.priceBounds.max, data.priceBounds.min, maxPrice, minPrice, q, router, sort, syncKey, brandIds]);

  useEffect(() => {
    setVisibleCount(20);
  }, [data.products]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + 20, data.products.length));
        }
      },
      { rootMargin: "220px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [data.products.length]);

  function toggleBrand(brandId: string) {
    setBrandIds((current) => (current.includes(brandId) ? current.filter((id) => id !== brandId) : [...current, brandId]));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="shop-block-card space-y-4 p-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
          <SlidersHorizontal className="h-4 w-4 shop-promo-accent" />
          筛选
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-500" htmlFor="catalog-search">
            搜索
          </label>
          <input
            className="shop-form-input h-10"
            id="catalog-search"
            onChange={(event) => setQ(event.target.value)}
            placeholder="商品名 / SKU / 品牌"
            value={q}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500">分类</p>
          <div className="grid grid-cols-2 gap-2">
            {data.categories.map((item) => (
              <button
                className={cn("rounded-md border px-3 py-2 text-left text-sm transition", category === item.slug ? "border-orange-300 bg-orange-50 shop-promo-accent" : "border-orange-100 bg-[var(--shop-control)] text-neutral-600 hover:bg-orange-50")}
                key={item.slug}
                onClick={() => setCategory(item.slug)}
                type="button"
              >
                {item.label}
                <span className="ml-1 text-xs text-neutral-400">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500">品牌</p>
          <div className="max-h-48 space-y-2 overflow-auto pr-1">
            {data.brands.map((brand) => (
              <label className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-orange-50" key={brand.id}>
                <span className="flex items-center gap-2">
                  <input checked={brandIds.includes(brand.id)} className="h-4 w-4 accent-orange-600" onChange={() => toggleBrand(brand.id)} type="checkbox" />
                  {brand.name}
                </span>
                <span className="text-xs text-neutral-400">{brand.count}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-neutral-500">价格区间</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input
              className="shop-form-input h-9 min-w-0 px-2"
              min={data.priceBounds.min}
              max={maxPrice}
              onChange={(event) => setMinPrice(Math.min(Number(event.target.value), maxPrice))}
              inputMode="decimal"
              type="number"
              value={minPrice}
            />
            <input
              className="shop-form-input h-9 min-w-0 px-2"
              min={minPrice}
              max={data.priceBounds.max}
              onChange={(event) => setMaxPrice(Math.max(Number(event.target.value), minPrice))}
              inputMode="decimal"
              type="number"
              value={maxPrice}
            />
          </div>
          <input
            aria-label="最低价格"
            className="w-full accent-orange-600"
            max={data.priceBounds.max}
            min={data.priceBounds.min}
            onChange={(event) => setMinPrice(Math.min(Number(event.target.value), maxPrice))}
            type="range"
            value={minPrice}
          />
          <input
            aria-label="最高价格"
            className="w-full accent-orange-600"
            max={data.priceBounds.max}
            min={data.priceBounds.min}
            onChange={(event) => setMaxPrice(Math.max(Number(event.target.value), minPrice))}
            type="range"
            value={maxPrice}
          />
        </div>
      </aside>

      <section className="space-y-4">
        <div className="shop-block-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-950">商品目录</h1>
            <p className="mt-1 text-sm text-neutral-500">
              共 {data.products.length} 件，{formatCurrency(minPrice)} - {formatCurrency(maxPrice)}
            </p>
          </div>
          <select
            className="shop-form-input h-10 w-auto"
            onChange={(event) => setSort(event.target.value as typeof sort)}
            value={sort}
          >
            {sortLabels.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {visibleProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="shop-empty-state">
            <p className="text-base font-semibold text-neutral-950">未找到相关商品</p>
            <p className="mt-2 text-sm text-neutral-500">换个关键词或筛选条件试试。</p>
          </div>
        )}

        <div ref={sentinelRef} className="py-5 text-center text-sm text-neutral-400">
          {hasMore ? "加载更多商品..." : data.products.length > 0 ? "已显示全部商品" : null}
        </div>
      </section>
    </div>
  );
}
