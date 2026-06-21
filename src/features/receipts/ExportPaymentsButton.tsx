"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { logReportExport } from "@/features/reports/actions";

type PaymentRow = {
  id: string;
  orderNo: string;
  customerName: string;
  type: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string | null;
};

export function ExportPaymentsButton({ payments }: { payments: PaymentRow[] }) {
  const [, startTransition] = useTransition();

  function exportCsv() {
    startTransition(() => {
      void logReportExport({ report: "receipts", rowCount: payments.length });
    });

    const rows = [
      ["订单号", "客户", "类型", "金额", "方式", "状态", "收付时间"],
      ...payments.map((payment) => [payment.orderNo, payment.customerName, payment.type, payment.amount.toFixed(2), payment.method, payment.status, payment.paidAt ?? ""]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={exportCsv} type="button" variant="outline">
      <Download className="h-4 w-4" />
      导出 CSV
    </Button>
  );
}
