"use client";

import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { importImageMaterialCsv, previewImageMaterialCsv, type ImageMaterialCsvPreviewRow } from "@/features/products/image-material-actions";
import type { ProductImageMaterialProductOption } from "@/features/products/queries";

type ImageMaterialBulkImportFormProps = {
  products: ProductImageMaterialProductOption[];
};

type PreviewState = {
  rows: ImageMaterialCsvPreviewRow[];
  summary: { total: number; importable: number; errors: number; warnings: number };
};

const templateHeader = ["sku", "candidateImageUrl", "sourcePage", "sourceName", "licenseStatus", "approved", "authAttachmentUrl", "notes"];

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function makeTemplate(products: ProductImageMaterialProductOption[]) {
  const rows = [
    templateHeader.join(","),
    ...products.map((product) =>
      [
        product.sku,
        "",
        "",
        "",
        "internal-demo-approved",
        "FALSE",
        "",
        `${product.brand}/${product.category}/${product.name}`,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return `${rows.join("\n")}\n`;
}

export function ImageMaterialBulkImportForm({ products }: ImageMaterialBulkImportFormProps) {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return URL.createObjectURL(new Blob([makeTemplate(products)], { type: "text/csv;charset=utf-8" }));
  }, [products]);

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setPreview(null);
    setMessage(null);
  }

  function runPreview() {
    setMessage(null);
    startTransition(async () => {
      const result = await previewImageMaterialCsv(csvText);
      if (!result.success) {
        setMessage({ type: "error", text: result.error.message });
        return;
      }
      setPreview({ rows: result.rows, summary: result.summary });
      setMessage({ type: "success", text: `预检完成：${result.summary.importable} 行可导入` });
    });
  }

  function runImport() {
    if (!preview) {
      setMessage({ type: "error", text: "请先预检 CSV" });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await importImageMaterialCsv(preview.rows);
      if (!result.success) {
        setMessage({ type: "error", text: result.error.message });
        return;
      }
      setMessage({
        type: result.errors.length ? "error" : "success",
        text: `导入完成：新增 ${result.created} 条，跳过 ${result.skipped} 条${result.errors.length ? `，错误 ${result.errors.length} 条` : ""}`,
      });
      setCsvText("");
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">CSV 批量导入</h2>
        </div>
        <Button asChild variant="outline">
          <a download="product-image-materials-template.csv" href={templateUrl}>
            <Download className="h-4 w-4" />
            下载模板
          </a>
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <textarea
          className="form-input min-h-44 resize-y py-3 font-mono text-xs"
          onChange={(event) => {
            setCsvText(event.target.value);
            setPreview(null);
          }}
          placeholder={templateHeader.join(",")}
          value={csvText}
        />
        <div className="space-y-3">
          <input accept=".csv,text/csv" className="hidden" onChange={loadFile} ref={fileInputRef} type="file" />
          <Button className="w-full" onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
            <Upload className="h-4 w-4" />
            上传 CSV
          </Button>
          <Button className="w-full" disabled={isPending || !csvText.trim()} onClick={runPreview} type="button">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            预检 CSV
          </Button>
          <Button className="w-full" disabled={isPending || !preview || preview.summary.importable === 0} onClick={runImport} type="button">
            应用导入
          </Button>
          {message ? <p className={message.type === "success" ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{message.text}</p> : null}
        </div>
      </div>

      {preview ? (
        <div className="mt-5 overflow-hidden rounded-md border border-[var(--dashboard-line)]">
          <div className="grid grid-cols-4 gap-3 bg-[var(--dashboard-control)] px-4 py-3 text-sm text-slate-600">
            <span>总行数：{preview.summary.total}</span>
            <span>可导入：{preview.summary.importable}</span>
            <span>错误：{preview.summary.errors}</span>
            <span>警告：{preview.summary.warnings}</span>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[var(--dashboard-panel)] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">行</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">商品</th>
                  <th className="px-4 py-3 font-medium">授权</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">问题</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className="border-t border-slate-100" key={`${row.rowNumber}-${row.sku}-${row.imageUrl}`}>
                    <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.sku || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.productName || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.licenseStatus || "-"}</td>
                    <td className="px-4 py-3">
                      {row.errors.length ? (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">错误</span>
                      ) : row.approved ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">可导入</span>
                      ) : (
                        <span className="rounded-full bg-[var(--dashboard-transaction-soft)] px-2 py-1 text-xs font-medium text-slate-600">跳过</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {[...row.errors, ...row.warnings, row.duplicateHint].filter(Boolean).map((item) => (
                        <span className="mr-2 inline-flex items-center gap-1" key={item}>
                          <AlertTriangle className="h-3 w-3" />
                          {item}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
