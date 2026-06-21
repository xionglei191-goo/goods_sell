import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { formatCurrency, getProductDetail } from "@/features/products/queries";
import { roleHasPermission } from "@/features/auth/permissions";

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
  const session = await auth();
  const product = await getProductDetail(id);
  if (!product) {
    notFound();
  }
  const canViewCost = roleHasPermission(session?.user.role, "finance:manage");
  const canViewWholesale = roleHasPermission(session?.user.role, "orders:write") || canViewCost;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="outline">
          <Link href="/dashboard/products">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">{product.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{product.sku}</p>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex aspect-square items-center justify-center surface-panel text-sm text-neutral-400">
          暂无图片
        </div>
        <div className="grid gap-4 surface-panel p-5 sm:grid-cols-2">
          <Info label="分类" value={product.category} />
          <Info label="品牌" value={product.brand} />
          <Info label="规格" value={product.spec ?? "-"} />
          <Info label="单位" value={product.unit} />
          {canViewCost ? <Info label="进价" value={formatCurrency(product.costPrice)} /> : null}
          {canViewWholesale ? <Info label="批发价" value={formatCurrency(product.wholesalePrice)} /> : null}
          <Info label="零售价" value={formatCurrency(product.retailPrice)} />
          <Info label="会员价" value={product.memberPrice ? formatCurrency(product.memberPrice) : "-"} />
          <Info label="当前库存" value={`${product.stock}`} />
          <Info label="安全库存" value={`${product.safeStock}`} />
          <Info label="大单阈值" value={`${product.bulkThreshold}`} />
          <Info label="状态" value={statusLabels[product.status]} />
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">产品描述</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{product.description ?? "暂无描述"}</p>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 font-medium text-neutral-950">{value}</p>
    </div>
  );
}
