import { notFound } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StockCheckConfirmForm } from "@/features/warehouse/StockCheckConfirmForm";
import { formatDateTime, getStockCheckDetail } from "@/features/warehouse/queries";

export const dynamic = "force-dynamic";

type StockCheckPageProps = {
  params: Promise<{ id: string }>;
};

const statusLabels = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
} as const;

export default async function StockCheckDetailPage({ params }: StockCheckPageProps) {
  const { id } = await params;
  const check = await getStockCheckDetail(id);
  if (!check) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">盘点任务 {check.checkNo}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {check.operator} · {statusLabels[check.status]} · 创建于 {formatDateTime(check.createdAt)}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/warehouse">返回仓储作业</Link>
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <InfoCard label="盘点 SKU" value={String(check.items.length)} />
        <InfoCard label="差异 SKU" value={String(check.items.filter((item) => item.actualStock !== item.systemStock).length)} />
        <InfoCard label="确认时间" value={check.confirmedAt ? formatDateTime(check.confirmedAt) : "待确认"} />
      </section>

      <StockCheckConfirmForm disabled={check.status !== "DRAFT"} items={check.items} stockCheckId={check.id} />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="surface-panel p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-neutral-950">{value}</p>
    </section>
  );
}
