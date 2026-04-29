import { SalespersonManager } from "@/features/salespeople/SalespersonManager";
import { getSalespersonManagementData } from "@/features/salespeople/queries";
import { formatCurrency } from "@/features/orders/utils";

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
        <h1 className="text-2xl font-semibold text-slate-900">销售员管理</h1>
        <p className="mt-1 text-sm text-slate-500">维护销售账号、启停状态，并跟踪名下客户、订单、销售额与应收。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="销售员" value={String(data.summary.total)} />
        <SummaryCard label="启用中" value={String(data.summary.active)} />
        <SummaryCard label="客户数" value={String(data.summary.customers)} />
        <SummaryCard label="销售额" value={formatCurrency(data.summary.revenue)} />
        <SummaryCard label="应收" value={formatCurrency(data.summary.receivable)} tone="red" />
      </section>

      <SalespersonManager filters={data.filters} salespeople={data.items} />
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "red" }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={tone === "red" ? "mt-2 text-2xl font-bold text-red-700" : "mt-2 text-2xl font-bold text-slate-900"}>{value}</p>
    </div>
  );
}
