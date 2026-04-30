"use client";

import { Grid3X3, Home, LogIn, Search, ShoppingCart, Type, User } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { AiFloatingBubble } from "@/features/ai/AiFloatingBubble";
import { getDefaultAuthorizedPath } from "@/features/auth/permissions";
import type { ShopUser } from "@/features/shop/types";
import { cn } from "@/lib/utils";

type ShopShellProps = {
  user: ShopUser | null;
  cartCount: number;
  children: React.ReactNode;
};

const tabs = [
  { href: "/shop", label: "首页", icon: Home },
  { href: "/shop/catalog", label: "分类", icon: Grid3X3 },
  { href: "/shop/cart", label: "购物车", icon: ShoppingCart },
  { href: "/shop/account", label: "我的", icon: User },
];

export function ShopShell({ user, cartCount, children }: ShopShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [largeType, setLargeType] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const stored = window.localStorage.getItem("huaqi-large-type") === "true";
    setLargeType(stored);
    document.documentElement.classList.toggle("shop-large-type", stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("huaqi-large-type", String(largeType));
    document.documentElement.classList.toggle("shop-large-type", largeType);
  }, [largeType]);

  const accountHref = useMemo(() => {
    if (!user) return "/login?callbackUrl=/shop/account";
    if (user.role !== "CONSUMER") return getDefaultAuthorizedPath(user.role);
    return "/shop/account";
  }, [user]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    router.push(`/shop/catalog${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="shop-surface min-h-screen bg-[#fafaf9] pb-20 text-stone-900 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#fafaf9]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link className="flex shrink-0 items-center gap-2" href="/shop">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#dc2626] text-base font-bold text-white">华</span>
            <span className="hidden text-lg font-bold text-stone-950 sm:inline">华启商城</span>
          </Link>

          <form className="relative min-w-0 flex-1" onSubmit={submitSearch}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              className="h-10 w-full rounded-full border border-stone-200 bg-white pl-9 pr-4 text-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索酒水、食品、饮料"
              value={query}
            />
          </form>

          <nav className="hidden items-center gap-1 md:flex">
            <Link className={cn("rounded-full px-3 py-2 text-sm font-medium", pathname === "/shop" ? "bg-red-50 text-[#dc2626]" : "text-stone-600 hover:bg-stone-100")} href="/shop">
              首页
            </Link>
            <Link className={cn("rounded-full px-3 py-2 text-sm font-medium", pathname.startsWith("/shop/catalog") ? "bg-red-50 text-[#dc2626]" : "text-stone-600 hover:bg-stone-100")} href="/shop/catalog">
              分类
            </Link>
            <Link className={cn("relative rounded-full px-3 py-2 text-sm font-medium", pathname.startsWith("/shop/cart") ? "bg-red-50 text-[#dc2626]" : "text-stone-600 hover:bg-stone-100")} href="/shop/cart">
              购物车
              {cartCount > 0 ? <span className="ml-1 rounded-full bg-[#dc2626] px-1.5 py-0.5 text-xs text-white">{cartCount}</span> : null}
            </Link>
          </nav>

          <Button aria-label="切换适老化字体" className={cn("h-10 w-10 rounded-full", largeType ? "bg-red-50 text-[#dc2626]" : "")} onClick={() => setLargeType((value) => !value)} size="icon" variant="outline">
            <Type className="h-4 w-4" />
          </Button>

          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white" href={accountHref}>
                {user.name?.slice(0, 1) ?? "我"}
              </Link>
              <Button onClick={() => signOut({ callbackUrl: "/shop" })} variant="outline">
                退出
              </Button>
            </div>
          ) : (
            <Button asChild className="hidden bg-[#dc2626] text-white hover:bg-[#b91c1c] md:inline-flex">
              <Link href="/login?callbackUrl=/shop">
                <LogIn className="h-4 w-4" />
                登录
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white md:hidden">
        <div className="grid grid-cols-4">
          {tabs.map((tab) => {
            const href = tab.href === "/shop/account" ? accountHref : tab.href;
            const active = tab.href === "/shop" ? pathname === "/shop" : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-[#dc2626]" : "text-stone-500")} href={href} key={tab.href}>
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {tab.href === "/shop/cart" && cartCount > 0 ? (
                    <span className="absolute -right-2.5 -top-2 rounded-full bg-[#dc2626] px-1.5 py-0.5 text-[10px] leading-none text-white">{cartCount}</span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {user ? <AiFloatingBubble contextLabel="商城 AI 助手" /> : null}
    </div>
  );
}
