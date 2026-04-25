import { CheckCircle2, ClipboardList, PackageCheck, Truck } from "lucide-react";
import Link from "next/link";

import { DeliveryActions } from "@/features/delivery/DeliveryActions";
import { DeliveryFilters } from "@/features/delivery/DeliveryFilters";
import { formatDateTime, getDeliveryData } from "@/features/delivery/queries";
import { orderStatusClasses, orderStatusLabels } from "@/features/orders/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DeliveryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DeliveryPage({ searchParams }: DeliveryPageProps) {
  const params = await searchParams;
  const data = await getDeliveryData(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">物流配送</h1>
        <p className="mt-1 text-sm text-slate-500">配送单列表、发货、送达和配送时间线。</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={ClipboardList} label="今日待发货" value={String(data.summary.pendingToday)} />
        <SummaryCard icon={Truck} label="配送中" value={String(data.summary.shipping)} />
        <SummaryCard icon={PackageCheck} label="今日已送达" value={String(data.summary.deliveredToday)} />
        <SummaryCard icon={CheckCircle2} label="完成率" value={`${data.summary.completionRate}%`} />
      </section>

      <DeliveryFilters initial={data.filters} />

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">订单号</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">地址</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">物流单号</th>
                <th className="px-4 py-3 font-medium">发货/送达</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={item.id}>
                  <td className="px-4 py-3">
                    <Link className="font-medium text-slate-900 hover:text-red-700" href={`/dashboard/delivery/${item.id}`}>
                      {item.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.customerName}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.address}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[item.status])}>{orderStatusLabels[item.status]}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.trackingNo ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    <p>{formatDateTime(item.shippedAt)}</p>
                    <p>{formatDateTime(item.deliveredAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <DeliveryActions initialTrackingNo={item.trackingNo} orderId={item.id} status={item.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">共 {data.items.length} 张配送单</div>
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-[#dc2626]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </section>
  );
}
