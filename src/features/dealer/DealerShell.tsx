"use client";

import { ClipboardList, Home, LogOut, QrCode, ReceiptText, UsersRound, Warehouse } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type DealerShellProps = {
  dealer: {
    name: string;
    zone: string;
    isAccepting: boolean;
  };
  children: React.ReactNode;
};

const tabs = [
  { href: "/dealer/incoming", label: "待接", icon: Home },
  { href: "/dealer/my-orders", label: "订单", icon: ClipboardList },
  { href: "/dealer/promotion", label: "推广", icon: QrCode },
  { href: "/dealer/leads", label: "线索", icon: UsersRound },
  { href: "/dealer/stock", label: "库存", icon: Warehouse },
  { href: "/dealer/settlement", label: "结算", icon: ReceiptText },
];

export function DealerShell({ dealer, children }: DealerShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{dealer.name}</p>
            <p className="text-xs text-slate-500">{dealer.zone} · {dealer.isAccepting ? "接单中" : "暂停接单"}</p>
          </div>
          <button className="rounded-full border border-slate-200 p-2 text-slate-500" onClick={() => signOut({ callbackUrl: "/login" })} type="button">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-3xl grid-cols-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname.startsWith(tab.href);
            return (
              <Link className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-[#dc2626]" : "text-slate-500")} href={tab.href} key={tab.href}>
                <Icon className="h-5 w-5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
