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
          <h1 className="text-2xl font-semibold text-neutral-950">对账单</h1>
          <p className="mt-1 text-sm text-neutral-500">期初 + 本期发生 - 本期收款 = 期末</p>
        </div>
        <StatementTools filename={filename} rowCount={data.rows.length} />
      </div>

      <form className="grid gap-3 surface-panel p-4 print:hidden md:grid-cols-[1fr_180px_180px_120px]">
        <select className="form-input" name="customerId" defaultValue={data.customer?.id ?? ""}>
          {data.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} · {customer.phone}
            </option>
          ))}
        </select>
        <input className="form-input" name="startDate" type="date" defaultValue={data.startDate.toISOString().slice(0, 10)} />
        <input className="form-input" name="endDate" type="date" defaultValue={data.endDate.toISOString().slice(0, 10)} />
        <button className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white" type="submit">生成</button>
      </form>

      <section className="surface-panel p-6 print:shadow-none print:ring-0" data-statement>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-neutral-950">华启商城对账单</h2>
          <p className="mt-2 text-sm text-neutral-500">{data.customer?.name ?? "-"} · {formatDate(data.startDate)} 至 {formatDate(data.endDate)}</p>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-3 text-center text-sm">
          <div className="rounded-md bg-orange-50 p-3">
            <p className="text-neutral-500">期初余额</p>
            <p className="mt-1 font-semibold text-neutral-950">{formatCurrency(data.opening)}</p>
          </div>
          <div className="rounded-md bg-orange-50 p-3">
            <p className="text-neutral-500">本期发生</p>
            <p className="mt-1 font-semibold text-neutral-950">{formatCurrency(data.orderAmount)}</p>
          </div>
          <div className="rounded-md bg-orange-50 p-3">
            <p className="text-neutral-500">本期收款</p>
            <p className="mt-1 font-semibold text-neutral-950">{formatCurrency(data.paymentAmount)}</p>
          </div>
          <div className="rounded-md bg-orange-50 p-3">
            <p className="text-neutral-500">期末余额</p>
            <p className="mt-1 font-semibold text-orange-700">{formatCurrency(data.ending)}</p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="dashboard-table-head">
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
                <tr className="border-t border-neutral-100" key={`${row.type}-${row.id}`}>
                  <td className="px-3 py-3 text-neutral-500">{formatDateTime(row.date)}</td>
                  <td className="px-3 py-3 text-neutral-700">{row.type}</td>
                  <td className="px-3 py-3 text-neutral-700">{row.no}</td>
                  <td className="px-3 py-3 text-right text-neutral-950">{row.debit ? formatCurrency(row.debit) : "-"}</td>
                  <td className="px-3 py-3 text-right text-neutral-950">{row.credit ? formatCurrency(row.credit) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
