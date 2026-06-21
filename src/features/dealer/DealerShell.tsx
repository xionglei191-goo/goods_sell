"use client";

import { ClipboardList, Home, LogOut, ReceiptText } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AiFloatingBubble } from "@/features/ai/AiFloatingBubble";
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
  { href: "/dealer/settlement", label: "结算", icon: ReceiptText },
];

export function DealerShell({ dealer, children }: DealerShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--dashboard-surface)] pb-20 text-neutral-950">
      <header className="sticky top-0 z-30 border-b bg-[var(--dashboard-panel)]" style={{ borderColor: "var(--dashboard-line)" }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{dealer.name}</p>
            <p className="text-xs text-neutral-500">{dealer.zone} · {dealer.isAccepting ? "接单中" : "暂停接单"}</p>
          </div>
          <button className="rounded-full border bg-[var(--dashboard-control)] p-2 text-neutral-500 transition-colors hover:bg-[#fff1e8] hover:text-[#b9472d]" onClick={() => signOut({ callbackUrl: "/login" })} style={{ borderColor: "var(--dashboard-line)" }} type="button">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
      <AiFloatingBubble contextLabel="经销商 AI 助手" />
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--dashboard-panel)]" style={{ borderColor: "var(--dashboard-line)" }}>
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname.startsWith(tab.href);
            return (
              <Link className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors", active ? "bg-[#fff1e8] text-[#b9472d]" : "text-neutral-500 hover:bg-[#fff7ee] hover:text-[#b9472d]")} href={tab.href} key={tab.href}>
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
