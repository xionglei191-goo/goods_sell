import type { LeadScene } from "@prisma/client";
import { BadgeCheck, ExternalLink, QrCode, ScanLine, ShoppingBag, UsersRound } from "lucide-react";
import Link from "next/link";

import { leadSceneLabels, leadStatusClasses, leadStatusLabels } from "@/features/channel/labels";
import { CopyLinkButton, CreateDealerPromoterCodeButton } from "@/features/dealer/DealerPromotionTools";
import { getDealerPromotion } from "@/features/dealer/queries";
import { formatCurrency } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

const sceneCreateLabels: Record<Extract<LeadScene, "BANQUET" | "GROUP_BUY" | "RESTOCK">, string> = {
  BANQUET: "宴席码",
  GROUP_BUY: "团购码",
  RESTOCK: "补货码",
};

function qrStyle(value: string) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(value)}`;
  return { backgroundImage: `url("${src}")` };
}

export default async function DealerPromotionPage() {
  const data = await getDealerPromotion();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">门店推广</h1>
          <p className="mt-1 text-sm text-slate-500">{data.dealer.zone} · {data.dealer.isAccepting ? "接单中" : "暂停接单"}</p>
        </div>
        <QrCode className="mt-1 h-7 w-7 text-[#dc2626]" />
      </div>

      <section className="grid grid-cols-2 gap-3">
        <StatCard icon={QrCode} label="推广码" value={String(data.summary.activeCodeCount)} />
        <StatCard icon={ScanLine} label="扫码/提交" value={String(data.summary.scans)} tone="blue" />
        <StatCard icon={UsersRound} label="线索" value={String(data.summary.leads)} tone="emerald" />
        <StatCard icon={ShoppingBag} label="成交" value={String(data.summary.convertedOrders)} tone="red" />
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">场景码</h2>
            <p className="mt-1 text-sm text-slate-500">成交报价 {formatCurrency(data.summary.convertedAmount)} · 履约订单 {data.summary.fulfilledOrders}</p>
          </div>
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
        </div>
        {data.missingScenes.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.missingScenes.map((scene) => (
              <CreateDealerPromoterCodeButton key={scene} label={sceneCreateLabels[scene]} scene={scene} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">宴席、团购、补货场景码已就绪</p>
        )}
      </section>

      {data.codes.length > 0 ? (
        <section className="space-y-3">
          {data.codes.map((code) => (
            <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200" key={code.id}>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="mx-auto h-44 w-44 shrink-0 rounded-lg bg-white bg-contain bg-center bg-no-repeat ring-1 ring-slate-200" style={qrStyle(code.primaryUrl)} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold text-slate-900">{code.label}</h2>
                      <span className={code.isActive ? "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500"}>
                        {code.isActive ? "启用" : "停用"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{code.code}</p>
                    <p className="mt-1 text-sm text-slate-500">{code.scene ? leadSceneLabels[code.scene] : "通用推广"} · {code.createdAt}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="扫码" value={String(code.scanCount)} />
                    <MiniStat label="线索" value={String(code.leadCount)} />
                    <MiniStat label="订单" value={String(code.orderCount)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyLinkButton value={code.primaryUrl} />
                    <Link className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50" href={code.primaryUrl} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                      打开
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">暂无推广码</div>
      )}

      {data.primaryLinks.length > 0 ? (
        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-900">快捷链接</h2>
          <div className="mt-3 space-y-2">
            {data.primaryLinks.map((link) => (
              <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2" key={link.scene}>
                <span className="text-sm font-medium text-slate-700">{leadSceneLabels[link.scene]}</span>
                <CopyLinkButton label="复制" value={link.url} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">最近线索</h2>
          <Link className="text-sm font-medium text-[#dc2626]" href="/dealer/leads">
            全部
          </Link>
        </div>
        {data.recentLeads.map((lead) => (
          <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200" key={lead.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{lead.name}</p>
                <p className="mt-1 text-xs text-slate-500">{lead.phone} · {leadSceneLabels[lead.scene]}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${leadStatusClasses[lead.status]}`}>{leadStatusLabels[lead.status]}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">{lead.inquiryNo} · {lead.budget}</p>
          </article>
        ))}
        {data.recentLeads.length === 0 ? <div className="rounded-lg bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">暂无线索</div> : null}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = "slate" }: { icon: typeof QrCode; label: string; value: string; tone?: "slate" | "blue" | "emerald" | "red" }) {
  const color = tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <p className="text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
