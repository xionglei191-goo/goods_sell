"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ShopHomeData } from "@/features/shop/types";
import { cn } from "@/lib/utils";

const toneClasses = {
  red: "from-red-700 via-red-600 to-stone-900",
  amber: "from-amber-700 via-red-700 to-stone-900",
  green: "from-emerald-700 via-red-700 to-stone-900",
};

type HeroCarouselProps = {
  banners: ShopHomeData["banners"];
};

export function HeroCarousel({ banners }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const active = banners[index] ?? banners[0];

  useEffect(() => {
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
    <section className={cn("relative overflow-hidden rounded-lg bg-gradient-to-br px-5 py-6 text-white shadow-sm md:px-8 md:py-10", toneClasses[active.tone])}>
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.25),transparent_45%)]" />
      <div className="relative max-w-xl">
        <p className="text-sm font-medium text-white/80">华启商城</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal md:text-4xl">{active.title}</h1>
        <p className="mt-3 text-base text-white/85">{active.subtitle}</p>
        <Button asChild className="mt-6 bg-white text-red-700 hover:bg-stone-100">
          <Link href={active.href}>去选购</Link>
        </Button>
      </div>
      <div className="absolute bottom-4 left-5 flex items-center gap-2 md:left-8">
        {banners.map((banner, dotIndex) => (
          <button
            aria-label={`切换到 ${banner.title}`}
            className={cn("h-2.5 rounded-full transition-all", dotIndex === index ? "w-7 bg-white" : "w-2.5 bg-white/50")}
            key={banner.id}
            onClick={() => go(dotIndex)}
            type="button"
          />
        ))}
      </div>
      <div className="absolute bottom-4 right-4 hidden gap-2 md:flex">
        <button aria-label="上一张" className="rounded-full bg-white/15 p-2 hover:bg-white/25" onClick={() => go(index - 1)} type="button">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button aria-label="下一张" className="rounded-full bg-white/15 p-2 hover:bg-white/25" onClick={() => go(index + 1)} type="button">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
