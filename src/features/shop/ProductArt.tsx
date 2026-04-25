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
    <div className={cn("relative flex aspect-square items-center justify-center overflow-hidden bg-stone-100", className)}>
      {imageUrl ? (
        <Image alt={name} className="object-cover" fill priority={priority} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" src={imageUrl} />
      ) : (
        <>
          <div className={cn("absolute inset-3 rounded-lg", accent.bg)} />
          <div className="absolute inset-x-5 top-5 h-10 rounded-full bg-white/70 blur-xl" />
          <div className={cn("relative flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm ring-1", accent.ring)}>
            <Package className={cn("h-8 w-8", accent.text)} />
          </div>
          <span className={cn("absolute bottom-4 right-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold shadow-sm", accent.text)}>
            {getProductInitial(name)}
          </span>
        </>
      )}
    </div>
  );
}
