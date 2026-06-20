"use client";

import { Bell, LogOut, Menu, Search, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { breadcrumbLabels } from "@/components/layout/dashboard-nav";
import type { AppRole } from "@/features/auth/types";

type HeaderUser = {
  name?: string | null;
  image?: string | null;
  role?: AppRole | null;
};

type HeaderProps = {
  user: HeaderUser;
  onMenuClick: () => void;
};

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  SALESPERSON: "销售员",
  WAREHOUSE: "仓管",
  FINANCE: "财务",
  CONSUMER: "消费者",
  DEALER: "经销商",
};

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return ["仪表盘"];
  }

  return segments.map((segment) => breadcrumbLabels[segment] ?? segment);
}

export function Header({ user, onMenuClick }: HeaderProps) {
  const breadcrumbs = useBreadcrumbs();
  const initials = user.name?.slice(0, 2) ?? "华启";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-[var(--dashboard-panel)]/95 px-4 backdrop-blur lg:px-6" style={{ borderColor: "var(--dashboard-line)" }}>
      <Button className="h-10 w-10 lg:hidden" onClick={onMenuClick} size="icon" variant="ghost">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <nav className="flex min-w-0 items-center gap-2 text-sm text-neutral-500">
          {breadcrumbs.map((breadcrumb, index) => (
            <span className="flex min-w-0 items-center gap-2" key={`${breadcrumb}-${index}`}>
              {index > 0 ? <span className="text-neutral-300">/</span> : null}
              <span className={index === breadcrumbs.length - 1 ? "truncate font-medium text-neutral-950" : "truncate"}>
                {breadcrumb}
              </span>
            </span>
          ))}
        </nav>
      </div>

      <div className="hidden h-10 w-full max-w-sm items-center gap-2 rounded-md border px-3 md:flex" style={{ backgroundColor: "var(--dashboard-control)", borderColor: "var(--dashboard-line)" }}>
        <Search className="h-4 w-4 text-neutral-400" />
        <input
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          placeholder="搜索产品、订单、客户"
          type="search"
        />
      </div>

      <Button className="h-10 w-10" size="icon" variant="ghost">
        <Bell className="h-5 w-5 text-neutral-600" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 rounded-md p-1 transition hover:bg-[#fff1e8]" type="button">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="bg-[#e86f51] text-white">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-left md:block">
              <span className="block text-sm font-medium text-neutral-950">{user.name ?? "未登录用户"}</span>
              <span className="block text-xs text-neutral-500">{roleLabels[user.role ?? ""] ?? "待认证"}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>账户</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <UserRound className="h-4 w-4" />
            个人信息
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
