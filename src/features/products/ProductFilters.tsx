"use client";

import type { ProductStatus } from "@prisma/client";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { BrandOption, CategoryOption } from "@/features/products/queries";

type ProductFiltersProps = {
  brands: BrandOption[];
  categories: CategoryOption[];
  initial: {
    q: string;
    categoryId: string;
    brandId: string;
    status: ProductStatus | "";
  };
};

export function ProductFilters({ brands, categories, initial }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [brandId, setBrandId] = useState(initial.brandId);
  const [status, setStatus] = useState<ProductStatus | "">(initial.status);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (categoryId) params.set("categoryId", categoryId);
      if (brandId) params.set("brandId", brandId);
      if (status) params.set("status", status);

      startTransition(() => {
        router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [brandId, categoryId, pathname, q, router, status]);

  return (
    <div className="dashboard-toolbar lg:grid-cols-[1fr_180px_180px_160px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          className="form-input pl-9"
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜索产品名称 / SKU"
          value={q}
        />
      </div>
      <select className="form-input" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
        <option value="">全部分类</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select className="form-input" onChange={(event) => setBrandId(event.target.value)} value={brandId}>
        <option value="">全部品牌</option>
        {brands.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>
      <select className="form-input" onChange={(event) => setStatus(event.target.value as ProductStatus | "")} value={status}>
        <option value="">全部状态</option>
        <option value="ACTIVE">上架</option>
        <option value="INACTIVE">下架</option>
        <option value="OUT_OF_STOCK">缺货</option>
      </select>
      {isPending ? <span className="sr-only">筛选中</span> : null}
    </div>
  );
}
