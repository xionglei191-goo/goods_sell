import { StockMovementForm } from "@/features/inventory/StockMovementForm";
import { getInventoryList } from "@/features/inventory/queries";

export const dynamic = "force-dynamic";

export default async function StockInPage() {
  const products = await getInventoryList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">入库操作</h1>
        <p className="mt-1 text-sm text-slate-500">采购入库、退货入库或手动增加库存</p>
      </div>
      <StockMovementForm mode="in" products={products} />
    </div>
  );
}
