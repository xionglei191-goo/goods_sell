"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { OrderListItem } from "@/features/orders/types";
import { formatCurrency, formatDateTime, orderStatusLabels, orderTypeLabels, routingTypeLabels } from "@/features/orders/utils";
import { logReportExport } from "@/features/reports/actions";

type ExportOrdersButtonProps = {
  orders: OrderListItem[];
};

function escapeCsv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ExportOrdersButton({ orders }: ExportOrdersButtonProps) {
  const [, startTransition] = useTransition();

  function exportCsv() {
    startTransition(() => {
      void logReportExport({ report: "orders", rowCount: orders.length });
    });

    const header = ["订单号", "客户", "手机号", "类型", "金额", "支付状态", "订单状态", "分单类型", "创建时间"];
    const rows = orders.map((order) => [
      order.orderNo,
      order.customerName,
      order.customerPhone,
      orderTypeLabels[order.type],
      formatCurrency(order.payableAmount),
      order.paymentLabel,
      orderStatusLabels[order.status],
      routingTypeLabels[order.routingType],
      formatDateTime(order.createdAt),
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `华启订单列表-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={exportCsv} variant="outline">
      <Download className="h-4 w-4" />
      导出 CSV
    </Button>
  );
}
