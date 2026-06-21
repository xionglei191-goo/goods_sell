import { ImageMaterialLicenseStatus, ImageMaterialReviewStatus } from "@prisma/client";
import { ExternalLink, Filter, ImageOff, Images, PackageCheck, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImageMaterialActions } from "@/features/products/ImageMaterialActions";
import { ImageMaterialBatchActions } from "@/features/products/ImageMaterialBatchActions";
import { ImageMaterialBulkImportForm } from "@/features/products/ImageMaterialBulkImportForm";
import { ImageMaterialCreateForm } from "@/features/products/ImageMaterialCreateForm";
import {
  getProductImageMaterialPageData,
  type ProductImageMaterialFilters,
  type ProductImageMaterialItem,
} from "@/features/products/queries";
import { ProductArt } from "@/features/shop/ProductArt";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ProductImageMaterialsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const reviewStatusLabels: Record<ImageMaterialReviewStatus, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

const reviewStatusClasses: Record<ImageMaterialReviewStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

const licenseStatusLabels: Record<ImageMaterialLicenseStatus, string> = {
  PENDING: "待确认授权",
  AUTHORIZED: "已授权",
  BRAND_PROVIDED: "品牌方提供",
  SUPPLIER_PROVIDED: "供应商提供",
  OWNED: "自有素材",
  PUBLIC_DOMAIN: "公共领域",
  CC: "CC 授权",
  INTERNAL_DEMO_APPROVED: "内部展示授权",
};

const licenseStatusClasses: Record<ImageMaterialLicenseStatus, string> = {
  PENDING: "bg-[var(--dashboard-transaction-soft)] text-slate-600",
  AUTHORIZED: "bg-[var(--dashboard-transaction-soft)] text-[#b9472d]",
  BRAND_PROVIDED: "bg-indigo-50 text-indigo-700",
  SUPPLIER_PROVIDED: "bg-cyan-50 text-cyan-700",
  OWNED: "bg-emerald-50 text-emerald-700",
  PUBLIC_DOMAIN: "bg-violet-50 text-violet-700",
  CC: "bg-fuchsia-50 text-fuchsia-700",
  INTERNAL_DEMO_APPROVED: "bg-orange-50 text-orange-700",
};

const storageProviderLabels = {
  LOCAL: "本地",
  CLOUDFLARE_R2: "Cloudflare R2",
  ALIYUN_OSS: "阿里云 OSS",
  REMOTE_URL: "远程 URL",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function enumParam<T extends Record<string, string>>(source: T, value: string | undefined): T[keyof T] | undefined {
  return value && Object.values(source).includes(value) ? (value as T[keyof T]) : undefined;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildHref(filters: ProductImageMaterialFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
  if (filters.licenseStatus) params.set("licenseStatus", filters.licenseStatus);
  if (filters.missingOnly) params.set("missingOnly", "1");
  params.set("page", String(page));
  return `/dashboard/products/materials?${params.toString()}`;
}

function previewStyle(url: string | null) {
  if (!url) return undefined;
  return { backgroundImage: `url("${url.replace(/"/g, "%22")}")` };
}

function formatFileSize(value: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ProductImageMaterialsPage({ searchParams }: ProductImageMaterialsPageProps) {
  const params = await searchParams;
  const filters: ProductImageMaterialFilters = {
    q: firstParam(params.q) ?? "",
    reviewStatus: enumParam(ImageMaterialReviewStatus, firstParam(params.reviewStatus)),
    licenseStatus: enumParam(ImageMaterialLicenseStatus, firstParam(params.licenseStatus)),
    missingOnly: firstParam(params.missingOnly) === "1",
    page: Number(firstParam(params.page) ?? 1),
  };
  const data = await getProductImageMaterialPageData(filters);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const visibleMaterials = data.items.flatMap((product) =>
    product.materials.map((material) => ({
      id: material.id,
      productName: product.name,
      sourceName: material.sourceName,
      reviewStatus: material.reviewStatus,
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">图片素材</h1>
          <p className="mt-1 text-sm text-slate-500">管理商品图片来源、授权状态和商城主图。</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/products">返回产品列表</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard icon={Images} label="商品总数" value={data.stats.totalProducts} />
        <StatCard icon={ImageOff} label="缺主图" tone="red" value={data.stats.missingPrimaryImages} />
        <StatCard icon={ShieldCheck} label="待审核素材" tone="amber" value={data.stats.pendingMaterials} />
        <StatCard icon={PackageCheck} label="已通过素材" tone="green" value={data.stats.approvedMaterials} />
        <StatCard icon={Filter} label="重复素材" tone="amber" value={data.stats.duplicateMaterials} />
      </section>

      <ImageMaterialCreateForm products={data.productOptions} />
      <ImageMaterialBulkImportForm products={data.productOptions} />
      <ImageMaterialBatchActions materials={visibleMaterials} />

      <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">筛选</h2>
        </div>
        <form className="mt-4 grid gap-4 lg:grid-cols-[1fr_180px_180px_140px_auto]">
          <input className="form-input" defaultValue={filters.q} name="q" placeholder="搜索 SKU / 商品名" />
          <select className="form-input" defaultValue={filters.reviewStatus ?? ""} name="reviewStatus">
            <option value="">全部审核状态</option>
            {Object.values(ImageMaterialReviewStatus).map((status) => (
              <option key={status} value={status}>
                {reviewStatusLabels[status]}
              </option>
            ))}
          </select>
          <select className="form-input" defaultValue={filters.licenseStatus ?? ""} name="licenseStatus">
            <option value="">全部授权状态</option>
            {Object.values(ImageMaterialLicenseStatus).map((status) => (
              <option key={status} value={status}>
                {licenseStatusLabels[status]}
              </option>
            ))}
          </select>
          <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-[var(--dashboard-panel)] px-3 text-sm text-slate-700">
            <input className="h-4 w-4 rounded border-slate-300" defaultChecked={filters.missingOnly} name="missingOnly" type="checkbox" value="1" />
            缺主图
          </label>
          <div className="flex gap-2">
            <Button type="submit">筛选</Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/products/materials">重置</Link>
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {data.items.length === 0 ? (
          <div className="empty-state p-8">暂无匹配的商品素材记录</div>
        ) : null}
        {data.items.map((product) => (
          <article className="surface-panel overflow-hidden" key={product.id}>
            <div className="grid gap-5 p-5 lg:grid-cols-[96px_1fr_auto]">
              <ProductArt categoryName={product.category} className="h-24 w-24 rounded-lg" imageUrl={product.currentImageUrl} name={product.name} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">{product.name}</h2>
                  {product.currentImageUrl ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">已有主图</span>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">缺主图</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {product.sku} · {product.brand} · {product.category}
                </p>
                <p className="mt-2 text-sm text-slate-500">图库记录：{product.imagesCount} 张，素材记录：{product.materials.length} 条</p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/dashboard/products/${product.id}`}>查看商品</Link>
              </Button>
            </div>

            <div className="border-t border-slate-100">
              {product.materials.length === 0 ? (
                <div className="px-5 py-6 text-sm text-neutral-500">当前商品暂无素材记录</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {product.materials.map((material) => (
                    <MaterialRow key={material.id} material={material} />
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <div className="flex items-center justify-between rounded-lg bg-[var(--dashboard-panel)] px-4 py-3 text-sm text-slate-500 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <span>
          共 {data.total} 个商品，第 {data.page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <Button asChild disabled={data.page <= 1} size="sm" variant="outline">
            <Link href={buildHref(filters, Math.max(data.page - 1, 1))}>上一页</Link>
          </Button>
          <Button asChild disabled={data.page >= totalPages} size="sm" variant="outline">
            <Link href={buildHref(filters, Math.min(data.page + 1, totalPages))}>下一页</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = "blue" }: { icon: LucideIcon; label: string; value: number; tone?: "blue" | "green" | "amber" | "red" }) {
  const toneClasses = {
    blue: "bg-[var(--dashboard-transaction-soft)] text-[#b9472d]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function MaterialRow({ material }: { material: ProductImageMaterialItem }) {
  return (
    <div className="grid gap-4 px-5 py-4 lg:grid-cols-[88px_1fr_auto]">
      <a
        className="block h-24 w-24 rounded-lg bg-[var(--dashboard-transaction-soft)] bg-cover bg-center ring-1 ring-[var(--dashboard-line)]"
        href={material.previewUrl}
        rel="noreferrer"
        style={previewStyle(material.previewUrl)}
        target="_blank"
        title="预览图片"
      >
        <span className="sr-only">预览图片</span>
      </a>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-1 text-xs font-medium", reviewStatusClasses[material.reviewStatus])}>
            {reviewStatusLabels[material.reviewStatus]}
          </span>
          <span className={cn("rounded-full px-2 py-1 text-xs font-medium", licenseStatusClasses[material.licenseStatus])}>
            {licenseStatusLabels[material.licenseStatus]}
          </span>
          <span className="text-xs text-slate-400">登记：{formatDateTime(material.createdAt)}</span>
          {material.approvedAt ? <span className="text-xs text-slate-400">通过：{formatDateTime(material.approvedAt)}</span> : null}
        </div>
        <p className="mt-2 truncate text-sm text-slate-600">{material.sourceName || "未填写来源名称"}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{material.imageUrl}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          <span>存储：{storageProviderLabels[material.storageProvider]}</span>
          <span>格式：{material.contentType ?? "-"}</span>
          <span>大小：{formatFileSize(material.fileSize)}</span>
          <span>
            尺寸：{material.width && material.height ? `${material.width} x ${material.height}` : "-"}
          </span>
          {material.imageHash ? <span>Hash：{material.imageHash.slice(0, 10)}</span> : null}
        </div>
        {material.duplicateOfMaterialId ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">疑似重复素材：{material.duplicateOfMaterialId.slice(0, 8)}</p>
        ) : null}
        {material.notes ? <p className="mt-2 text-sm leading-6 text-slate-600">{material.notes}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {material.sourcePage ? (
            <Button asChild className="h-8 px-2" size="sm" variant="ghost">
              <a href={material.sourcePage} rel="noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
                来源页面
              </a>
            </Button>
          ) : null}
          {material.authAttachmentUrl ? (
            <Button asChild className="h-8 px-2" size="sm" variant="ghost">
              <a href={material.authAttachmentUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
                授权附件
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <ImageMaterialActions id={material.id} licenseStatus={material.licenseStatus} reviewStatus={material.reviewStatus} />
    </div>
  );
}
