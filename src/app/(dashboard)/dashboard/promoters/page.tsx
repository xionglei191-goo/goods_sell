import { leadSceneLabels, promoterOwnerTypeLabels } from "@/features/channel/labels";
import { PromoterCodeForm } from "@/features/channel/PromoterCodeForm";
import { getPromoterDashboardData, getPromoterFormOptions } from "@/features/channel/queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PromotersPage({ searchParams }: PageProps) {
  const [data, options] = await Promise.all([getPromoterDashboardData(await searchParams), getPromoterFormOptions()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">推广码管理</h1>
        <p className="mt-1 text-sm text-slate-500">追踪业务员、经销商和活动二维码带来的扫码、线索和成交。</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="推广码" value={String(data.summary.total)} />
        <SummaryCard label="扫码" value={String(data.summary.scans)} tone="blue" />
        <SummaryCard label="线索" value={String(data.summary.leads)} tone="emerald" />
        <SummaryCard label="订单" value={String(data.summary.orders)} tone="red" />
      </section>

      <PromoterCodeForm options={options} />

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">推广码</th>
                <th className="px-4 py-3 font-medium">归属</th>
                <th className="px-4 py-3 font-medium">场景</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">扫码</th>
                <th className="px-4 py-3 font-medium">线索</th>
                <th className="px-4 py-3 font-medium">订单</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.label}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{item.code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{promoterOwnerTypeLabels[item.ownerType]}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.owner}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.scene ? leadSceneLabels[item.scene] : "通用"}</td>
                  <td className="px-4 py-3">
                    <span className={item.isActive ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500"}>
                      {item.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.scanCount}</td>
                  <td className="px-4 py-3 text-slate-600">{item.leadCount}</td>
                  <td className="px-4 py-3 text-slate-600">{item.orderCount}</td>
                  <td className="px-4 py-3 text-slate-500">{item.createdAt}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                    暂无推广码，后续可由业务员或经销商绑定时生成。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "emerald" | "red" }) {
  const color = tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
