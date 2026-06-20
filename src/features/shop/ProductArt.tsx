import { Package } from "lucide-react";
import Image from "next/image";

import { getCategoryAccent, getProductInitial } from "@/features/shop/utils";
import { cn } from "@/lib/utils";

type ProductArtProps = {
  name: string;
  categoryName: string;
  imageUrl?: string | null;
  className?: string;
  priority?: boolean;
};

export function ProductArt({ name, categoryName, imageUrl, className, priority }: ProductArtProps) {
  const accent = getCategoryAccent(categoryName);

  return (
    <div className={cn("shop-product-art", className)}>
      {imageUrl ? (
        <Image alt={name} className="object-cover" fill priority={priority} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" src={imageUrl} />
      ) : (
        <>
          <div className={cn("shop-product-art-inner", accent.bg)} />
          <div className="absolute inset-x-5 top-5 h-10 rounded-full bg-orange-50/70 blur-xl" />
          <div className={cn("shop-product-art-mark h-16 w-16 sm:h-20 sm:w-20", accent.ring)}>
            <Package className={cn("h-8 w-8", accent.text)} />
          </div>
          <span className={cn("absolute bottom-3 right-3 rounded-full border border-orange-100 bg-[var(--shop-control)] px-2.5 py-1 text-xs font-semibold shadow-[var(--surface-raised-shadow)] sm:bottom-4 sm:right-4 sm:px-3 sm:text-sm", accent.text)}>
            {getProductInitial(name)}
          </span>
        </>
      )}
    </div>
  );
}
