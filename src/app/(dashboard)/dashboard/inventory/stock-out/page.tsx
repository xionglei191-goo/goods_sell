import { StockMovementForm } from "@/features/inventory/StockMovementForm";
import { getInventoryList } from "@/features/inventory/queries";

export const dynamic = "force-dynamic";

export default async function StockOutPage() {
  const products = await getInventoryList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">出库操作</h1>
        <p className="mt-1 text-sm text-neutral-500">订单出库、损耗出库或手动扣减库存</p>
      </div>
      <StockMovementForm mode="out" products={products} />
    </div>
  );
}
