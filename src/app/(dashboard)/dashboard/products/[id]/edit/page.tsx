import { notFound } from "next/navigation";

import { ProductForm } from "@/features/products/ProductForm";
import { getBrands, getCategories, getProductDetail } from "@/features/products/queries";

export const dynamic = "force-dynamic";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const [product, categories, brands] = await Promise.all([getProductDetail(id), getCategories(), getBrands()]);
  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">编辑产品</h1>
        <p className="mt-1 text-sm text-slate-500">{product.name}</p>
      </div>
      <ProductForm brands={brands} categories={categories} product={product} />
    </div>
  );
}
