import { AlertTriangle, ArrowRight, Boxes, ClipboardList, PackageSearch } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CreateStockCheckButton, SafeStockEditor } from "@/features/warehouse/WarehouseActions";
import { formatDateTime, formatNumber, getWarehouseData } from "@/features/warehouse/queries";

export const dynamic = "force-dynamic";

const stockTypeLabels = {
  IN: "入库",
  OUT: "出库",
  ADJUST: "调整",
  CHECK: "盘点",
} as const;

const checkStatusLabels = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
} as const;

export default async function WarehousePage() {
  const data = await getWarehouseData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">仓储作业</h1>
          <p className="mt-1 text-sm text-slate-500">库存预警、安全库存、出入库动态和盘点闭环。</p>
        </div>
        <CreateStockCheckButton />
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Boxes} label="总 SKU" value={formatNumber(data.summary.totalSku)} />
        <SummaryCard icon={PackageSearch} label="总库存" value={formatNumber(data.summary.totalStock)} />
        <SummaryCard icon={AlertTriangle} label="预警商品数" value={formatNumber(data.summary.warningCount)} />
        <SummaryCard icon={ClipboardList} label="今日出入库" value={formatNumber(data.summary.todayRecords)} />
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">库存预警</h2>
            <p className="mt-1 text-sm text-slate-500">按每个商品的 safeStock 单独判断，库存小于等于阈值即预警。</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/purchase">
              跳转采购
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">商品</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">品牌</th>
                <th className="px-4 py-3 font-medium">当前库存</th>
                <th className="px-4 py-3 font-medium">安全库存</th>
                <th className="px-4 py-3 font-medium">缺口</th>
              </tr>
            </thead>
            <tbody>
              {data.warningProducts.map((product) => (
                <tr className="border-t border-slate-100" key={product.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                  <td className="px-4 py-3 text-slate-500">{product.sku}</td>
                  <td className="px-4 py-3 text-slate-600">{product.brand}</td>
                  <td className="px-4 py-3 font-semibold text-red-700">{product.stock}</td>
                  <td className="px-4 py-3">
                    <SafeStockEditor initialValue={product.safeStock} productId={product.id} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.warningProducts.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">当前暂无库存预警</p> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-900">今日出入库动态</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {data.recentRecords.map((record) => (
              <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_110px_110px]" key={record.id}>
                <div>
                  <p className="font-medium text-slate-900">{record.productName}</p>
                  <p className="mt-1 text-xs text-slate-500">{record.sku} · {record.operator} · {record.remark ?? "无备注"}</p>
                </div>
                <p className="text-slate-600">{stockTypeLabels[record.type]}</p>
                <p className={record.quantity >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                  {record.quantity > 0 ? "+" : ""}{record.quantity}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-semibold text-slate-900">盘点任务</h2>
          <p className="mt-1 text-xs text-slate-500">下一任务号前缀：{data.nextCheckHint}</p>
          <div className="mt-4 space-y-3">
            {data.checks.map((check) => (
              <Link className="block rounded-lg border border-slate-200 p-3 transition hover:border-red-200 hover:bg-red-50/40" href={`/dashboard/warehouse/checks/${check.id}`} key={check.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{check.checkNo}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{checkStatusLabels[check.status]}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{check.operator} · {check.itemCount} 项 · {formatDateTime(check.createdAt)}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
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
