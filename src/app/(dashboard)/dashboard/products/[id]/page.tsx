import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatCurrency, getProductDetail } from "@/features/products/queries";
import { ProductArt } from "@/features/shop/ProductArt";

export const dynamic = "force-dynamic";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

const statusLabels = {
  ACTIVE: "上架",
  INACTIVE: "下架",
  OUT_OF_STOCK: "缺货",
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getProductDetail(id);
  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="outline">
          <Link href="/dashboard/products">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{product.sku}</p>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <ProductArt categoryName={product.category} className="rounded-lg shadow-sm ring-1 ring-slate-200" imageUrl={product.imageUrl} name={product.name} />
        <div className="grid gap-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2">
          <Info label="分类" value={product.category} />
          <Info label="品牌" value={product.brand} />
          <Info label="规格" value={product.spec ?? "-"} />
          <Info label="单位" value={product.unit} />
          <Info label="进价" value={formatCurrency(product.costPrice)} />
          <Info label="批发价" value={formatCurrency(product.wholesalePrice)} />
          <Info label="零售价" value={formatCurrency(product.retailPrice)} />
          <Info label="会员价" value={product.memberPrice ? formatCurrency(product.memberPrice) : "-"} />
          <Info label="当前库存" value={`${product.stock}`} />
          <Info label="安全库存" value={`${product.safeStock}`} />
          <Info label="大单阈值" value={`${product.bulkThreshold}`} />
          <Info label="状态" value={statusLabels[product.status]} />
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">产品描述</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{product.description ?? "暂无描述"}</p>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}
