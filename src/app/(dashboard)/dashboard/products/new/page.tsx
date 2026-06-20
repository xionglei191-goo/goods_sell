import { ProductForm } from "@/features/products/ProductForm";
import { getBrands, getCategories } from "@/features/products/queries";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([getCategories(), getBrands()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">新增产品</h1>
        <p className="mt-1 text-sm text-neutral-500">填写产品基础信息、价格、库存和分单阈值</p>
      </div>
      <ProductForm brands={brands} categories={categories} />
    </div>
  );
}
