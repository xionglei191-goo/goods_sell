import type { StockType } from "@prisma/client";

import { getInventoryList, getStockRecords } from "@/features/inventory/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type RecordsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const typeLabels: Record<StockType, string> = {
  IN: "入库",
  OUT: "出库",
  ADJUST: "调整",
  CHECK: "盘点",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StockRecordsPage({ searchParams }: RecordsPageProps) {
  const params = await searchParams;
  const productId = firstParam(params.productId) ?? "";
  const type = firstParam(params.type) as StockType | undefined;
  const [products, records] = await Promise.all([getInventoryList(), getStockRecords({ productId, type })]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">库存变动记录</h1>
        <p className="mt-1 text-sm text-slate-500">查看所有入库、出库、调整和盘点流水</p>
      </div>

      <form className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1fr_180px_auto]">
        <select className="form-input" defaultValue={productId} name="productId">
          <option value="">全部产品</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <select className="form-input" defaultValue={type ?? ""} name="type">
          <option value="">全部类型</option>
          <option value="IN">入库</option>
          <option value="OUT">出库</option>
          <option value="ADJUST">调整</option>
          <option value="CHECK">盘点</option>
        </select>
        <button className="rounded-md bg-[#1e3a5f] px-4 text-sm font-medium text-white" type="submit">
          筛选
        </button>
      </form>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">产品</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">数量</th>
                <th className="px-4 py-3 font-medium">变动前</th>
                <th className="px-4 py-3 font-medium">变动后</th>
                <th className="px-4 py-3 font-medium">操作人</th>
                <th className="px-4 py-3 font-medium">备注</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr className="border-t border-slate-100 hover:bg-slate-50" key={record.id}>
                  <td className="px-4 py-3 text-slate-600">{record.createdAt}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{record.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{typeLabels[record.type]}</td>
                  <td className={cn("px-4 py-3 font-medium", record.quantity >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {record.quantity > 0 ? `+${record.quantity}` : record.quantity}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{record.beforeStock}</td>
                  <td className="px-4 py-3 text-slate-900">{record.afterStock}</td>
                  <td className="px-4 py-3 text-slate-600">{record.operator}</td>
                  <td className="px-4 py-3 text-slate-600">{record.remark ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
