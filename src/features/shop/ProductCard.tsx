import Link from "next/link";

import { AddToCartButton } from "@/features/shop/AddToCartButton";
import { ProductArt } from "@/features/shop/ProductArt";
import type { ShopProduct } from "@/features/shop/types";
import { formatCurrency } from "@/features/shop/utils";

type ProductCardProps = {
  product: ShopProduct;
  compact?: boolean;
};

export function ProductCard({ product, compact }: ProductCardProps) {
  const soldOut = product.stock <= 0;

  return (
    <article className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:shadow-md">
      <Link aria-label={`查看 ${product.name}`} href={`/shop/product/${product.id}`}>
        <ProductArt categoryName={product.rootCategoryName} className="rounded-t-lg" imageUrl={product.imageUrl} name={product.name} />
      </Link>
      <div className="space-y-3 p-3">
        <Link className="block" href={`/shop/product/${product.id}`}>
          <h3 className="line-clamp-1 text-sm font-semibold text-stone-900">{product.name}</h3>
          <p className="mt-1 text-xs text-stone-500">{product.brandName} · {product.spec ?? product.unit}</p>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-base font-bold text-[#dc2626]">{formatCurrency(product.retailPrice)}</p>
            {!compact ? <p className="text-xs text-stone-400">已售 {product.salesCount}</p> : null}
          </div>
          <AddToCartButton className="h-9 px-3" disabled={soldOut} productId={product.id} />
        </div>
      </div>
    </article>
  );
}
