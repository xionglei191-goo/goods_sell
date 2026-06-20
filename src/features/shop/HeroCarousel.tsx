"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ShopHomeData } from "@/features/shop/types";
import { cn } from "@/lib/utils";

const toneClasses = {
  red: "from-red-700 via-red-600 to-orange-600",
  amber: "from-orange-500 via-amber-500 to-red-600",
  green: "from-emerald-600 via-green-500 to-orange-500",
};

type HeroCarouselProps = {
  banners: ShopHomeData["banners"];
};

export function HeroCarousel({ banners }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const active = banners[index] ?? banners[0];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % banners.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  function go(nextIndex: number) {
    setIndex((nextIndex + banners.length) % banners.length);
  }

  if (!active) {
    return null;
  }

  return (
    <section className={cn("relative overflow-hidden rounded-md bg-gradient-to-br px-5 py-6 text-white shadow-[var(--surface-raised-shadow)] md:px-8 md:py-10", toneClasses[active.tone])}>
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08))]" />
      <div className="absolute -right-10 -top-16 h-40 w-40 rotate-12 rounded-md bg-white/10" />
      <div className="absolute -bottom-12 right-24 h-28 w-28 rotate-12 rounded-md bg-white/10" />
      <div className="relative max-w-xl">
        <p className="text-sm font-medium text-white/70">华启商城</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">{active.title}</h1>
        <p className="mt-3 text-base text-white/85">{active.subtitle}</p>
        <Button asChild className="mt-6 bg-[#dc2626] text-white shadow-[0_14px_30px_rgba(185,28,28,0.28)] hover:bg-[#b91c1c]">
          <Link href={active.href}>去选购</Link>
        </Button>
      </div>
      <div className="absolute bottom-4 left-5 flex items-center gap-2 md:left-8">
        {banners.map((banner, dotIndex) => (
          <button
            aria-label={`切换到 ${banner.title}`}
            className={cn("h-2 rounded-full transition-all", dotIndex === index ? "w-7 bg-white" : "w-2 bg-white/50")}
            key={banner.id}
            onClick={() => go(dotIndex)}
            type="button"
          />
        ))}
      </div>
      <div className="absolute bottom-4 right-4 hidden gap-2 md:flex">
        <button aria-label="上一张" className="rounded-md bg-white/15 p-2 hover:bg-white/25" onClick={() => go(index - 1)} type="button">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button aria-label="下一张" className="rounded-md bg-white/15 p-2 hover:bg-white/25" onClick={() => go(index + 1)} type="button">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
