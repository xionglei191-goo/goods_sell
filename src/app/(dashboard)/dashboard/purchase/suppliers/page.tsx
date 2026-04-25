import { SupplierManager } from "@/features/purchase/SupplierManager";
import { getSuppliers } from "@/features/purchase/queries";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">供应商管理</h1>
        <p className="mt-1 text-sm text-slate-500">维护供应商资料，有采购单时禁止删除</p>
      </div>
      <SupplierManager suppliers={suppliers} />
    </div>
  );
}
