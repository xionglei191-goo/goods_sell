import { ProductStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ProductFilters } from "@/features/products/ProductFilters";
import { ProductRowActions } from "@/features/products/ProductRowActions";
import { formatCurrency, getBrands, getCategories, getProducts } from "@/features/products/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusLabels: Record<ProductStatus, string> = {
  ACTIVE: "上架",
  INACTIVE: "下架",
  OUT_OF_STOCK: "缺货",
};

const statusClasses: Record<ProductStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-600",
  OUT_OF_STOCK: "bg-red-50 text-red-700",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const q = firstParam(params.q) ?? "";
  const categoryId = firstParam(params.categoryId) ?? "";
  const brandId = firstParam(params.brandId) ?? "";
  const status = firstParam(params.status) as ProductStatus | undefined;
  const page = Number(firstParam(params.page) ?? 1);
  const [products, categories, brands] = await Promise.all([
    getProducts({ q, categoryId, brandId, status, page }),
    getCategories(),
    getBrands(),
  ]);
  const totalPages = Math.max(1, Math.ceil(products.total / products.pageSize));
  const pageHref = (nextPage: number) => {
    const nextParams = new URLSearchParams();
    if (q) nextParams.set("q", q);
    if (categoryId) nextParams.set("categoryId", categoryId);
    if (brandId) nextParams.set("brandId", brandId);
    if (status) nextParams.set("status", status);
    nextParams.set("page", String(nextPage));
    return `/dashboard/products?${nextParams.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">产品管理</h1>
          <p className="mt-1 text-sm text-slate-500">维护产品资料、分类、品牌和大单分单阈值</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/products/new">
            <Plus className="h-4 w-4" />
            新增产品
          </Link>
        </Button>
      </div>

      <ProductFilters brands={brands} categories={categories} initial={{ q, categoryId, brandId, status: status ?? "" }} />

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">产品</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">品牌</th>
                <th className="px-4 py-3 font-medium">零售价</th>
                <th className="px-4 py-3 font-medium">库存</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.items.map((product) => (
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={product.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">暂无图片</div>
                      <div>
                        <p className="font-medium text-slate-900">{product.name}</p>
                        <p className="mt-1 text-xs text-slate-500">大单阈值：{product.bulkThreshold}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.sku}</td>
                  <td className="px-4 py-3 text-slate-600">{product.category}</td>
                  <td className="px-4 py-3 text-slate-600">{product.brand}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(product.retailPrice)}</td>
                  <td className="px-4 py-3 text-slate-600">{product.stock}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", statusClasses[product.status])}>
                      {statusLabels[product.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ProductRowActions id={product.id} status={product.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>
            共 {products.total} 条，第 {products.page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button asChild disabled={products.page <= 1} size="sm" variant="outline">
              <Link href={pageHref(Math.max(products.page - 1, 1))}>上一页</Link>
            </Button>
            <Button asChild disabled={products.page >= totalPages} size="sm" variant="outline">
              <Link href={pageHref(Math.min(products.page + 1, totalPages))}>下一页</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
