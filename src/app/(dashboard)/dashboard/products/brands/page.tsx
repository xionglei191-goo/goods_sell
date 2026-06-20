import { BrandManager } from "@/features/products/BrandManager";
import { getBrands } from "@/features/products/queries";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const brands = await getBrands();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">品牌管理</h1>
        <p className="mt-1 text-sm text-neutral-500">维护品牌资料，有关联产品时禁止删除</p>
      </div>
      <BrandManager brands={brands} />
    </div>
  );
}
