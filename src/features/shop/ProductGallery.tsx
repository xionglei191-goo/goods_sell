"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { ProductArt } from "@/features/shop/ProductArt";
import type { ProductDetailData } from "@/features/shop/types";

type ProductGalleryProps = {
  product: ProductDetailData["product"];
};

export function ProductGallery({ product }: ProductGalleryProps) {
  const images = product.images.length > 0 ? product.images : [{ id: "placeholder", url: "", alt: product.name }];
  const [index, setIndex] = useState(0);

  function go(next: number) {
    setIndex((next + images.length) % images.length);
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-stone-200">
        <ProductArt categoryName={product.rootCategoryName} className="min-h-[320px]" imageUrl={images[index]?.url || product.imageUrl} name={product.name} priority />
        {images.length > 1 ? (
          <>
            <button aria-label="上一张图片" className="absolute left-3 top-1/2 rounded-full bg-white/85 p-2 text-stone-700 shadow-sm" onClick={() => go(index - 1)} type="button">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button aria-label="下一张图片" className="absolute right-3 top-1/2 rounded-full bg-white/85 p-2 text-stone-700 shadow-sm" onClick={() => go(index + 1)} type="button">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
      <div className="flex justify-center gap-2">
        {images.map((image, imageIndex) => (
          <button
            aria-label={`切换到第 ${imageIndex + 1} 张图片`}
            className={imageIndex === index ? "h-2.5 w-7 rounded-full bg-[#dc2626]" : "h-2.5 w-2.5 rounded-full bg-stone-300"}
            key={image.id}
            onClick={() => setIndex(imageIndex)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
