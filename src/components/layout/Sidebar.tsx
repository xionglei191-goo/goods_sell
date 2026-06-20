"use client";

import { ChevronDown, LogOut, PanelLeftClose } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { dashboardNavItems } from "@/components/layout/dashboard-nav";
import { filterDashboardNavItems } from "@/features/auth/permissions";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/features/auth/types";

type SidebarUser = {
  name?: string | null;
  image?: string | null;
  role?: AppRole | null;
};

type SidebarProps = {
  user: SidebarUser;
  onNavigate?: () => void;
};

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  SALESPERSON: "销售员",
  WAREHOUSE: "仓管",
  FINANCE: "财务",
  CONSUMER: "消费者",
  DEALER: "经销商",
};

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function Sidebar({ user, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const navItems = useMemo(() => filterDashboardNavItems(user.role, dashboardNavItems), [user.role]);
  const activeParents = useMemo(() => {
    return navItems
      .filter((item) => item.children?.some((child) => isItemActive(pathname, child.href)))
      .map((item) => item.href);
  }, [navItems, pathname]);
  const [expanded, setExpanded] = useState<string[]>(activeParents);
  const [compact, setCompact] = useState(false);

  function toggleExpanded(href: string) {
    setExpanded((current) => (current.includes(href) ? current.filter((item) => item !== href) : [...current, href]));
  }

  const initials = user.name?.slice(0, 2) ?? "华启";

  return (
    <aside className={cn("flex h-full flex-col border-r text-neutral-800 transition-all duration-300", compact ? "w-20" : "w-60")} style={{ backgroundColor: "var(--dashboard-panel)", borderColor: "var(--dashboard-line)" }}>
      <div className="flex h-16 items-center justify-between px-4">
        <Link className="flex items-center gap-3" href="/dashboard" onClick={onNavigate}>
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#e86f51] text-sm font-bold text-white">华启</span>
          {compact ? null : <span className="text-base font-semibold text-neutral-950">华启商城</span>}
        </Link>
        <button
          aria-label={compact ? "展开菜单" : "折叠菜单"}
          className="hidden rounded-md p-2 text-neutral-400 transition hover:bg-[#fff1e8] hover:text-[#b9472d] lg:block"
          onClick={() => setCompact((value) => !value)}
          type="button"
        >
          <PanelLeftClose className={cn("h-4 w-4 transition-transform", compact ? "rotate-180" : "")} />
        </button>
      </div>

      <Separator style={{ backgroundColor: "var(--dashboard-line)" }} />

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = Boolean(item.children?.length);
            const itemActive = isItemActive(pathname, item.href) || item.children?.some((child) => isItemActive(pathname, child.href));
            const isExpanded = expanded.includes(item.href);

            return (
              <div key={item.href}>
                <div className="flex items-center gap-1">
                  <Link
                    className={cn(
                      "flex h-10 flex-1 items-center gap-3 rounded-md px-3 text-sm transition",
                      itemActive ? "bg-[#fff1e8] text-[#b9472d]" : "text-neutral-600 hover:bg-[#fff6ed] hover:text-neutral-950",
                    )}
                    href={item.href}
                    onClick={onNavigate}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {compact ? null : <span>{item.title}</span>}
                  </Link>
                  {hasChildren && !compact ? (
                    <button
                      aria-label={isExpanded ? "收起子菜单" : "展开子菜单"}
                      className="flex h-10 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-[#fff1e8] hover:text-[#b9472d]"
                      onClick={() => toggleExpanded(item.href)}
                      type="button"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-180" : "")} />
                    </button>
                  ) : null}
                </div>

                {hasChildren && isExpanded && !compact ? (
                  <div className="ml-7 mt-1 space-y-1 border-l pl-3" style={{ borderColor: "var(--dashboard-line)" }}>
                    {item.children?.map((child) => {
                      const childActive = isItemActive(pathname, child.href);

                      return (
                        <Link
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm transition",
                            childActive ? "bg-[#fff1e8] text-[#b9472d]" : "text-neutral-500 hover:bg-[#fff6ed] hover:text-neutral-950",
                          )}
                          href={child.href}
                          key={child.href}
                          onClick={onNavigate}
                        >
                          {child.title}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      <Separator style={{ backgroundColor: "var(--dashboard-line)" }} />

      <div className="p-4">
        <div className={cn("mb-3 flex items-center gap-3 rounded-md border p-3", compact ? "justify-center" : "")} style={{ backgroundColor: "var(--dashboard-control)", borderColor: "var(--dashboard-line)" }}>
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="bg-[#e86f51] text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className={cn("min-w-0 flex-1", compact ? "hidden" : "")}>
            <p className="truncate text-sm font-medium text-neutral-950">{user.name ?? "未登录用户"}</p>
            <p className="text-xs text-neutral-500">{roleLabels[user.role ?? ""] ?? "待认证"}</p>
          </div>
        </div>
        <Button
          className={cn(
            "h-10 w-full gap-2 text-neutral-600 hover:bg-[#fff1e8] hover:text-[#b9472d]",
            compact ? "justify-center px-0" : "justify-start",
          )}
          style={{ backgroundColor: "var(--dashboard-panel)", borderColor: "var(--dashboard-line)" }}
          onClick={() => signOut({ callbackUrl: "/login" })}
          variant="outline"
        >
          <LogOut className="h-4 w-4" />
          {compact ? null : "退出登录"}
        </Button>
      </div>
    </aside>
  );
}
