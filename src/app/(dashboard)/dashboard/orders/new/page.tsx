import { ManualOrderForm } from "@/features/orders/ManualOrderForm";
import { getManualOrderOptions } from "@/features/orders/queries";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const options = await getManualOrderOptions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">手动开单</h1>
        <p className="mt-1 text-sm text-neutral-500">为线下客户创建订单，提交后自动扣减库存并生成出库流水</p>
      </div>
      <ManualOrderForm options={options} />
    </div>
  );
}
