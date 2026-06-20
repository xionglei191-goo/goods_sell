import { AlertTriangle, Boxes, CircleDollarSign, PackageX } from "lucide-react";

import { formatCurrency, getInventoryList, getInventoryStatus } from "@/features/inventory/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const dotClasses = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  black: "bg-neutral-700",
};

export default async function InventoryPage() {
  const inventory = await getInventoryList();
  const warningCount = inventory.filter((item) => item.stock < item.safeStock).length;
  const outOfStockCount = inventory.filter((item) => item.stock === 0).length;
  const totalValue = inventory.reduce((total, item) => total + item.value, 0);

  return (
    <div className="space-y-6">
      <div className="dashboard-page-heading">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">库存总览</h1>
          <p className="mt-1 text-sm text-neutral-500">查看当前库存、安全库存和库存价值</p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Boxes} label="总 SKU 数" value={inventory.length.toString()} />
        <SummaryCard icon={AlertTriangle} label="预警商品数" value={warningCount.toString()} />
        <SummaryCard icon={PackageX} label="缺货商品数" value={outOfStockCount.toString()} />
        <SummaryCard icon={CircleDollarSign} label="总库存价值" value={formatCurrency(totalValue)} />
      </section>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">产品</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">当前库存</th>
                <th className="px-4 py-3 font-medium">安全库存</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">库存价值</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const status = getInventoryStatus(item);

                return (
                  <tr className="dashboard-table-row" key={item.id}>
                    <td className="px-4 py-3 font-medium text-neutral-950">{item.name}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.sku}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.category}</td>
                    <td className={cn("px-4 py-3", item.stock <= 0 ? "metric-risk" : item.stock <= item.safeStock ? "metric-warning" : "metric-positive")}>{item.stock}</td>
                    <td className="px-4 py-3 text-neutral-600">{item.safeStock}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", dotClasses[status.tone])} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 money-muted">{formatCurrency(item.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return (
    <div className="dashboard-kpi-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-neutral-950">{value}</p>
        </div>
        <span className="dashboard-accent-icon">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}
