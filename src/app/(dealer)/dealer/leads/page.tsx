import type { LeadStatus } from "@prisma/client";
import Link from "next/link";

import { inquiryStatusClasses, inquiryStatusLabels, leadSceneLabels, leadSourceLabels, leadStatusClasses, leadStatusLabels, quoteStatusClasses, quoteStatusLabels } from "@/features/channel/labels";
import { getDealerLeads } from "@/features/dealer/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusTabs: Array<{ key: "all" | LeadStatus; label: string }> = [
  { key: "all", label: "全部" },
  { key: "NEW", label: "新线索" },
  { key: "FOLLOWING", label: "跟进中" },
  { key: "CONVERTED", label: "已转化" },
];

function statusHref(status: "all" | LeadStatus) {
  return status === "all" ? "/dealer/leads" : `/dealer/leads?status=${status}`;
}

export default async function DealerLeadsPage({ searchParams }: PageProps) {
  const data = await getDealerLeads(await searchParams);
  const activeStatus = data.filters.status ?? "all";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">门店线索</h1>
        <p className="mt-1 text-sm text-slate-500">扫码、询价和分派到门店的客户需求</p>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <SummaryCard label="当前线索" value={String(data.summary.total)} />
        <SummaryCard label="新线索" value={String(data.summary.newCount)} tone="blue" />
        <SummaryCard label="跟进中" value={String(data.summary.followingCount)} tone="amber" />
        <SummaryCard label="已转化" value={String(data.summary.convertedCount)} tone="emerald" />
      </section>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {statusTabs.map((tab) => (
          <Link
            className={activeStatus === tab.key ? "shrink-0 rounded-full bg-[#dc2626] px-4 py-2 text-sm font-medium text-white" : "shrink-0 rounded-full border border-[var(--dashboard-line)] bg-[var(--dashboard-panel)] px-4 py-2 text-sm font-medium text-slate-600"}
            href={statusHref(tab.key)}
            key={tab.key}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="space-y-3">
        {data.items.map((lead) => (
          <article className="dealer-card p-4" key={lead.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{lead.name}</p>
                <p className="mt-1 text-xs text-slate-500">{lead.phone} · {leadSceneLabels[lead.scene]}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${leadStatusClasses[lead.status]}`}>{leadStatusLabels[lead.status]}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <InfoBlock label="来源" value={leadSourceLabels[lead.source]} />
              <InfoBlock label="推广码" value={lead.promoter} />
            </div>

            {lead.fieldSummary.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {lead.fieldSummary.map((item) => (
                  <span className="rounded-full bg-[var(--dashboard-transaction-soft)] px-2 py-1 text-xs text-slate-600" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            ) : null}

            {lead.inquiry ? (
              <div className="mt-4 rounded-md bg-[var(--dashboard-control)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{lead.inquiry.inquiryNo}</p>
                    <p className="mt-1 text-xs text-slate-500">{lead.inquiry.budget}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${inquiryStatusClasses[lead.inquiry.status]}`}>{inquiryStatusLabels[lead.inquiry.status]}</span>
                </div>
                {lead.quote ? (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--dashboard-line)] pt-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{lead.quote.quoteNo}</p>
                      <p className="mt-1 text-xs text-slate-500">{lead.quote.amount}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${quoteStatusClasses[lead.quote.status]}`}>{quoteStatusLabels[lead.quote.status]}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {lead.notes ? <p className="mt-3 text-sm text-slate-600">{lead.notes}</p> : null}
            <p className="mt-3 text-xs text-slate-400">{lead.createdAt}</p>
          </article>
        ))}
        {data.items.length === 0 ? <div className="dealer-empty-state">暂无线索</div> : null}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "amber" | "emerald" }) {
  const color = tone === "blue" ? "text-[#b9472d]" : tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="dealer-card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--dashboard-control)] px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate font-medium text-slate-800">{value}</p>
    </div>
  );
}
