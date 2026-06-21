"use client";

import { Download, Printer } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { logReportExport } from "@/features/reports/actions";

type StatementToolsProps = {
  filename: string;
  rowCount: number;
};

export function StatementTools({ filename, rowCount }: StatementToolsProps) {
  const [, startTransition] = useTransition();

  function exportHtml() {
    const printable = document.querySelector("[data-statement]");
    if (!printable) return;
    startTransition(() => {
      void logReportExport({ report: "statements", rowCount });
    });

    const blob = new Blob([`<!doctype html><meta charset="utf-8">${printable.outerHTML}`], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-2 print:hidden">
      <Button onClick={() => window.print()} variant="outline">
        <Printer className="h-4 w-4" />
        打印 / 保存 PDF
      </Button>
      <Button onClick={exportHtml} variant="outline">
        <Download className="h-4 w-4" />
        导出明细
      </Button>
    </div>
  );
}
