import { PaymentRegisterForm } from "@/features/finance/PaymentRegisterForm";
import { getPaymentRegisterData } from "@/features/finance/queries";

export const dynamic = "force-dynamic";

type PaymentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const params = await searchParams;
  const data = await getPaymentRegisterData(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">收款登记</h1>
        <p className="mt-1 text-sm text-slate-500">支持多订单核销与部分收款，超过 30 天账期自动标红</p>
      </div>
      <PaymentRegisterForm data={data} />
    </div>
  );
}
