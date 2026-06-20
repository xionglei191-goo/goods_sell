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
  const hasBulkDeal = product.bulkThreshold > 1;

  return (
    <article className="shop-block-card overflow-hidden">
      <Link aria-label={`查看 ${product.name}`} href={`/shop/product/${product.id}`}>
        <ProductArt categoryName={product.rootCategoryName} imageUrl={product.imageUrl} name={product.name} />
      </Link>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {product.salesCount > 0 ? <span className="shop-tag-promo">热卖 {product.salesCount}</span> : <span className="shop-tag-promo">新品上架</span>}
          {product.stock > 0 ? <span className="shop-tag-success">今日达</span> : null}
          {hasBulkDeal && !compact ? <span className="shop-tag-promo">整箱优惠</span> : null}
        </div>
        <Link className="block" href={`/shop/product/${product.id}`}>
          <h3 className="line-clamp-1 text-sm font-semibold text-neutral-950">{product.name}</h3>
          <p className="mt-1 text-xs text-neutral-500">{product.brandName} · {product.spec ?? product.unit}</p>
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <div className="min-w-0">
            <p className="money-text text-lg">{formatCurrency(product.retailPrice)}</p>
            {!compact ? <p className={product.stock > 0 ? "text-xs text-green-700" : "text-xs text-red-600"}>{product.stock > 0 ? `库存 ${product.stock}` : "暂时缺货"}</p> : null}
          </div>
          <AddToCartButton className="h-9 w-full px-3 sm:w-auto" disabled={soldOut} productId={product.id} />
        </div>
      </div>
    </article>
  );
}
