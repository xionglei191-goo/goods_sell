import { SalespersonManager } from "@/features/salespeople/SalespersonManager";
import { getSalespersonManagementData } from "@/features/salespeople/queries";

export const dynamic = "force-dynamic";

type SalespeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SalespeoplePage({ searchParams }: SalespeoplePageProps) {
  const params = await searchParams;
  const data = await getSalespersonManagementData(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">业务员绩效看板</h1>
        <p className="mt-1 text-sm text-slate-500">维护销售账号、启停状态，并跟踪地推经销商、线索报价转化、复购和销售结果。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="销售员" value={String(data.summary.total)} />
        <SummaryCard label="地推经销商" value={String(data.summary.dealers)} />
        <SummaryCard label="绑定客户" value={String(data.summary.customers)} />
        <SummaryCard label="线索转化" value={`${data.summary.convertedLeads}/${data.summary.leads}`} helper={formatPercent(data.summary.leadConversionRate)} />
        <SummaryCard label="报价转化" value={`${data.summary.convertedQuotes}/${data.summary.quotes}`} helper={formatPercent(data.summary.quoteConversionRate)} />
        <SummaryCard label="复购客户" value={`${data.summary.repeatCustomers}/${data.summary.buyingCustomers}`} helper={formatPercent(data.summary.repeatRate)} />
      </section>

      <SalespersonManager filters={data.filters} salespeople={data.items} />
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-lg bg-[var(--dashboard-panel)] p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}
