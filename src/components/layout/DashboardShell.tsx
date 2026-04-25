"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AppRole } from "@/features/auth/types";

type DashboardUser = {
  name?: string | null;
  image?: string | null;
  role?: AppRole | null;
};

type DashboardShellProps = {
  children: ReactNode;
  user: DashboardUser;
};

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] lg:flex">
      <div className="hidden shrink-0 lg:block">
        <Sidebar user={user} />
      </div>

      <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
        <SheetContent className="w-60 border-none bg-[#0f172a] p-0" side="left">
          <SheetTitle className="sr-only">管理后台菜单</SheetTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} user={user} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} user={user} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
