import { StatementTools } from "@/features/finance/StatementTools";
import { getStatementData } from "@/features/finance/queries";
import { formatCurrency, formatDate, formatDateTime } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

type StatementsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StatementsPage({ searchParams }: StatementsPageProps) {
  const params = await searchParams;
  const data = await getStatementData(params);
  const filename = `华启对账单-${data.customer?.name ?? "客户"}-${formatDate(data.startDate)}-${formatDate(data.endDate)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">对账单</h1>
          <p className="mt-1 text-sm text-slate-500">期初 + 本期发生 - 本期收款 = 期末</p>
        </div>
        <StatementTools filename={filename} />
      </div>

      <form className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 print:hidden md:grid-cols-[1fr_180px_180px_120px]">
        <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" name="customerId" defaultValue={data.customer?.id ?? ""}>
          {data.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} · {customer.phone}
            </option>
          ))}
        </select>
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" name="startDate" type="date" defaultValue={data.startDate.toISOString().slice(0, 10)} />
        <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" name="endDate" type="date" defaultValue={data.endDate.toISOString().slice(0, 10)} />
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">生成</button>
      </form>

      <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0" data-statement>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">华启商城对账单</h2>
          <p className="mt-2 text-sm text-slate-500">{data.customer?.name ?? "-"} · {formatDate(data.startDate)} 至 {formatDate(data.endDate)}</p>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-3 text-center text-sm">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-slate-500">期初余额</p>
            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(data.opening)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-slate-500">本期发生</p>
            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(data.orderAmount)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-slate-500">本期收款</p>
            <p className="mt-1 font-semibold text-slate-900">{formatCurrency(data.paymentAmount)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-slate-500">期末余额</p>
            <p className="mt-1 font-semibold text-red-700">{formatCurrency(data.ending)}</p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">日期</th>
                <th className="px-3 py-2 font-medium">类型</th>
                <th className="px-3 py-2 font-medium">单号</th>
                <th className="px-3 py-2 text-right font-medium">发生额</th>
                <th className="px-3 py-2 text-right font-medium">收款额</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr className="border-t border-slate-100" key={`${row.type}-${row.id}`}>
                  <td className="px-3 py-3 text-slate-500">{formatDateTime(row.date)}</td>
                  <td className="px-3 py-3 text-slate-700">{row.type}</td>
                  <td className="px-3 py-3 text-slate-700">{row.no}</td>
                  <td className="px-3 py-3 text-right text-slate-900">{row.debit ? formatCurrency(row.debit) : "-"}</td>
                  <td className="px-3 py-3 text-right text-slate-900">{row.credit ? formatCurrency(row.credit) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
