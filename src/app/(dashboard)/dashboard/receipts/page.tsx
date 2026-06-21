import { FileCheck2, FileClock, ReceiptText, WalletCards } from "lucide-react";

import { ExportPaymentsButton } from "@/features/receipts/ExportPaymentsButton";
import { InvoiceForm } from "@/features/receipts/InvoiceForm";
import { formatCurrency, formatDateTime, getReceiptsData } from "@/features/receipts/queries";

export const dynamic = "force-dynamic";

type ReceiptsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const paymentTypeLabels = {
  RECEIVE: "收款",
  PAY: "付款",
} as const;

const invoiceTypeLabels = {
  NORMAL: "普票",
  SPECIAL: "专票",
} as const;

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  const params = await searchParams;
  const data = await getReceiptsData(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">票据记录</h1>
        <p className="mt-1 text-sm text-neutral-500">收付款单据、电子发票和税控接口状态。</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={WalletCards} label="收款笔数/金额" value={`${data.summary.receiveCount} / ${formatCurrency(data.summary.receiveAmount)}`} />
        <SummaryCard icon={ReceiptText} label="付款笔数/金额" value={`${data.summary.payCount} / ${formatCurrency(data.summary.payAmount)}`} />
        <SummaryCard icon={FileClock} label="待开票" value={String(data.summary.pendingInvoice)} />
        <SummaryCard icon={FileCheck2} label="已开票" value={String(data.summary.issuedInvoice)} />
      </section>

      <InvoiceForm orders={data.invoiceableOrders} />

      <section className="surface-panel p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-neutral-950">收付款单据</h2>
            <p className="mt-1 text-sm text-neutral-500">支持导出当前列表 CSV。</p>
          </div>
          <ExportPaymentsButton payments={data.payments} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">订单</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">方式</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((payment) => (
                <tr className="border-t border-neutral-100" key={payment.id}>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600">{payment.orderNo}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-950">{payment.customerName}</p>
                    <p className="text-xs text-neutral-500">{payment.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{paymentTypeLabels[payment.type]}</td>
                  <td className="px-4 py-3 font-semibold text-neutral-950">{formatCurrency(payment.amount)}</td>
                  <td className="px-4 py-3 text-neutral-600">{payment.method}</td>
                  <td className="px-4 py-3 text-neutral-600">{payment.status}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatDateTime(payment.paidAt ?? payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="font-semibold text-neutral-950">电子发票列表</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">发票号</th>
                <th className="px-4 py-3 font-medium">购方</th>
                <th className="px-4 py-3 font-medium">订单</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">税控</th>
                <th className="px-4 py-3 font-medium">开票时间</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((invoice) => (
                <tr className="border-t border-neutral-100" key={invoice.id}>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">{invoice.invoiceNo}</td>
                  <td className="px-4 py-3 font-medium text-neutral-950">{invoice.buyerName}</td>
                  <td className="px-4 py-3 text-neutral-600">{invoice.orderNo}</td>
                  <td className="px-4 py-3 text-neutral-600">{invoiceTypeLabels[invoice.type]}</td>
                  <td className="px-4 py-3 font-semibold text-neutral-950">{formatCurrency(invoice.amount)}</td>
                  <td className="px-4 py-3 text-neutral-600">{invoice.provider}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatDateTime(invoice.issuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.invoices.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">暂无发票记录</p> : null}
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof ReceiptText; label: string; value: string }) {
  return (
    <section className="surface-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500">{label}</p>
          <p className="mt-3 text-xl font-semibold text-neutral-950">{value}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-orange-50 text-orange-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </section>
  );
}
