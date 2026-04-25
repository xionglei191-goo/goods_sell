import { PurchaseManager } from "@/features/purchase/PurchaseManager";
import { getPurchaseOrders, getPurchaseProducts, getSuppliers } from "@/features/purchase/queries";

export const dynamic = "force-dynamic";

export default async function PurchasePage() {
  const [orders, products, suppliers] = await Promise.all([getPurchaseOrders(), getPurchaseProducts(), getSuppliers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">采购订单</h1>
        <p className="mt-1 text-sm text-slate-500">创建采购单并在收货时自动入库</p>
      </div>
      <PurchaseManager orders={orders} products={products} suppliers={suppliers} />
    </div>
  );
}
