import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/features/shop/ProductCard";
import { ProductGallery } from "@/features/shop/ProductGallery";
import { ProductPurchasePanel } from "@/features/shop/ProductPurchasePanel";
import { getProductDetailData } from "@/features/shop/queries";
import { formatCurrency } from "@/features/shop/utils";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductDetailData(id);

  return {
    title: `${data.product.name} | 华启商城`,
    description: data.product.description ?? `${data.product.brandName} ${data.product.spec ?? ""}，华启商城湘潭本地配送。`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const data = await getProductDetailData(id);
  const product = data.product;
  const inStock = product.stock > 0;

  return (
    <div className="space-y-8">
      <div className="text-sm text-stone-500">
        <Link className="hover:text-[#dc2626]" href="/shop">
          首页
        </Link>
        <span className="mx-2">/</span>
        <Link className="hover:text-[#dc2626]" href={`/shop/catalog?category=${product.rootCategoryName === "酒类" ? "wine" : product.rootCategoryName === "食品" ? "food" : "drink"}`}>
          {product.rootCategoryName}
        </Link>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <ProductGallery product={product} />

        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <p className="text-sm text-stone-500">{product.brandName} · {product.categoryName}</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-stone-950 md:text-3xl">{product.name}</h1>
          <p className="mt-4 text-3xl font-bold text-[#dc2626]">{formatCurrency(product.retailPrice)}</p>
          {product.memberPrice ? <p className="mt-1 text-sm text-stone-500">会员价 {formatCurrency(product.memberPrice)}</p> : null}

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-stone-400">规格</p>
              <p className="mt-1 font-medium text-stone-900">{product.spec ?? product.unit}</p>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-stone-400">库存状态</p>
              <p className={inStock ? "mt-1 font-medium text-emerald-700" : "mt-1 font-medium text-red-700"}>{inStock ? `有货 ${product.stock}` : "缺货"}</p>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-stone-400">批发参考</p>
              <p className="mt-1 font-medium text-stone-900">{formatCurrency(product.wholesalePrice)}</p>
            </div>
            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-stone-400">大单阈值</p>
              <p className="mt-1 font-medium text-stone-900">{product.bulkThreshold} {product.unit}</p>
            </div>
          </div>

          <div className="mt-6">
            <ProductPurchasePanel productId={product.id} stock={product.stock} />
          </div>
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <h2 className="text-lg font-bold text-stone-950">商品详情</h2>
        <p className="mt-3 leading-7 text-stone-600">{product.description ?? "华启精选本地供应商品，支持湘潭市区配送。"}</p>
      </section>

      {data.relatedProducts.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-stone-950">相关推荐</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
