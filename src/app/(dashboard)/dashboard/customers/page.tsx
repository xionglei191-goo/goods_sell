import Link from "next/link";

import { CustomerFilters } from "@/features/customers/CustomerFilters";
import { getCustomerList } from "@/features/customers/queries";
import { formatDate } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const typeLabels = {
  CONSUMER: "消费者",
  DEALER: "经销商",
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const data = await getCustomerList(params);

  return (
    <div className="space-y-6">
      <div className="dashboard-page-heading">
        <div>
        <h1 className="text-2xl font-semibold text-neutral-950">客户管理</h1>
        <p className="mt-1 text-sm text-neutral-500">客户档案、消费统计、欠款与画像预留位</p>
        </div>
      </div>

      <CustomerFilters initial={data.filters} salespeople={data.salespeople} />

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">销售员</th>
                <th className="px-4 py-3 font-medium">标签</th>
                <th className="px-4 py-3 font-medium">订单数</th>
                <th className="px-4 py-3 font-medium">总消费</th>
                <th className="px-4 py-3 font-medium">欠款</th>
                <th className="px-4 py-3 font-medium">最近购买</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((customer) => (
                <tr className="dashboard-table-row" key={customer.id}>
                  <td className="px-4 py-3">
                    <Link className="font-medium text-neutral-950 hover:text-orange-700" href={`/dashboard/customers/${customer.id}`}>
                      {customer.name}
                    </Link>
                    <p className="mt-1 text-xs text-neutral-500">{customer.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{typeLabels[customer.type]}</td>
                  <td className="px-4 py-3 text-neutral-600">{customer.salesPerson}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {customer.tags.map((tag) => (
                        <span className="rounded-full bg-[#fff1e8] px-2 py-1 text-xs text-[#9f4a34]" key={tag}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{customer.orderCount}</td>
                  <td className="px-4 py-3 font-medium text-neutral-950">{customer.totalSpentText}</td>
                  <td className="px-4 py-3 font-medium text-orange-700">{customer.debtText}</td>
                  <td className="px-4 py-3 text-neutral-500">{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
