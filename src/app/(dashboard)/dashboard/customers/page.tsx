import Link from "next/link";

import { CustomerFilters } from "@/features/customers/CustomerFilters";
import { customerSegmentClasses, customerSegmentLabels } from "@/features/customers/segmentation";
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">客户管理</h1>
        <p className="mt-1 text-sm text-slate-500">客户档案、消费统计、欠款与动态分层。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-6">
        <SummaryCard label="客户总数" value={String(data.summary.total)} />
        <SummaryCard label="高价值团购" value={String(data.summary.HIGH_VALUE_GROUP_BUY)} tone="blue" />
        <SummaryCard label="餐饮店" value={String(data.summary.RESTAURANT)} tone="emerald" />
        <SummaryCard label="烟酒店" value={String(data.summary.TOBACCO_WINE_STORE)} tone="amber" />
        <SummaryCard label="宴席客户" value={String(data.summary.BANQUET)} tone="red" />
        <SummaryCard label="普通消费者" value={String(data.summary.REGULAR)} />
      </section>

      <CustomerFilters initial={data.filters} salespeople={data.salespeople} />

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">分层</th>
                <th className="px-4 py-3 font-medium">销售员</th>
                <th className="px-4 py-3 font-medium">标签</th>
                <th className="px-4 py-3 font-medium">场景</th>
                <th className="px-4 py-3 font-medium">订单数</th>
                <th className="px-4 py-3 font-medium">总消费</th>
                <th className="px-4 py-3 font-medium">欠款</th>
                <th className="px-4 py-3 font-medium">建议动作</th>
                <th className="px-4 py-3 font-medium">最近购买</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((customer) => (
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={customer.id}>
                  <td className="px-4 py-3">
                    <Link className="font-medium text-slate-900 hover:text-blue-700" href={`/dashboard/customers/${customer.id}`}>
                      {customer.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{customer.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{typeLabels[customer.type]}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${customerSegmentClasses[customer.segment]}`}>{customerSegmentLabels[customer.segment]}</span>
                    <div className="mt-2 space-y-1">
                      {customer.segmentReasons.map((reason) => (
                        <p className="text-xs text-slate-500" key={reason}>
                          {reason}
                        </p>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{customer.salesPerson}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {customer.tags.map((tag) => (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600" key={tag}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <p>团购 {customer.sceneStats.groupBuyCount} · 宴席 {customer.sceneStats.banquetCount}</p>
                    <p className="mt-1">补货 {customer.sceneStats.restockCount} · 团购额 {customer.groupBuyAmountText}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{customer.orderCount}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{customer.totalSpentText}</td>
                  <td className="px-4 py-3 font-medium text-red-700">{customer.debtText}</td>
                  <td className="max-w-56 px-4 py-3 text-slate-600">{customer.nextAction}</td>
                  <td className="px-4 py-3 text-slate-500">{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "-"}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={11}>
                    暂无客户数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" | "amber" | "red" }) {
  const color =
    tone === "blue"
      ? "text-blue-700"
      : tone === "emerald"
        ? "text-emerald-700"
        : tone === "amber"
          ? "text-amber-700"
          : tone === "red"
            ? "text-red-700"
            : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
