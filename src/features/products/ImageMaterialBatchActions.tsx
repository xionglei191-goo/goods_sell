"use client";

import { Check, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { batchProcessImageMaterials } from "@/features/products/image-material-actions";

type BatchMaterial = {
  id: string;
  productName: string;
  sourceName: string | null;
  reviewStatus: string;
};

type ImageMaterialBatchActionsProps = {
  materials: BatchMaterial[];
};

export function ImageMaterialBatchActions({ materials }: ImageMaterialBatchActionsProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectableMaterials = useMemo(() => materials.slice(0, 80), [materials]);
  const allSelected = selectableMaterials.length > 0 && selected.length === selectableMaterials.length;

  function toggleAll() {
    setSelected(allSelected ? [] : selectableMaterials.map((material) => material.id));
  }

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function run(operation: "approve" | "reject" | "delete") {
    if (selected.length === 0) {
      setMessage({ type: "error", text: "请选择素材" });
      return;
    }
    if (operation === "delete" && !window.confirm(`确认删除 ${selected.length} 条素材记录？`)) return;
    if (operation === "reject" && !window.confirm(`确认拒绝 ${selected.length} 条素材？`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await batchProcessImageMaterials(selected, operation);
      if (!result.success) {
        setMessage({ type: "error", text: result.error.message });
        return;
      }
      setSelected([]);
      setMessage({ type: "success", text: result.message ?? "批量操作成功" });
      router.refresh();
    });
  }

  if (selectableMaterials.length === 0) {
    return (
      <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
        当前筛选结果没有可批量处理的素材。
      </section>
    );
  }

  return (
    <section className="rounded-lg bg-[var(--dashboard-panel)] p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">批量处理</h2>
          <p className="mt-1 text-sm text-slate-500">当前页最多显示 80 条素材，可批量通过设主图、拒绝或删除。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={toggleAll} type="button" variant="outline">
            {allSelected ? "取消全选" : "全选当前页"}
          </Button>
          <Button disabled={isPending || selected.length === 0} onClick={() => run("approve")} type="button">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            批量通过
          </Button>
          <Button disabled={isPending || selected.length === 0} onClick={() => run("reject")} type="button" variant="outline">
            <X className="h-4 w-4" />
            批量拒绝
          </Button>
          <Button className="text-red-600 hover:text-red-700" disabled={isPending || selected.length === 0} onClick={() => run("delete")} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
            批量删除
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {selectableMaterials.map((material) => (
          <label className="flex items-start gap-3 rounded-md border border-[var(--dashboard-line)] p-3 text-sm hover:bg-[var(--dashboard-control)]" key={material.id}>
            <input checked={selected.includes(material.id)} className="mt-1 h-4 w-4 rounded border-slate-300" onChange={() => toggle(material.id)} type="checkbox" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900">{material.productName}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{material.sourceName || material.id}</span>
            </span>
          </label>
        ))}
      </div>

      {message ? <p className={message.type === "success" ? "mt-3 text-sm text-emerald-700" : "mt-3 text-sm text-red-700"}>{message.text}</p> : null}
    </section>
  );
}
