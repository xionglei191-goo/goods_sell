"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { confirmStockCheck } from "@/features/warehouse/actions";

type StockCheckItem = {
  id: string;
  sku: string;
  name: string;
  systemStock: number;
  actualStock: number;
};

export function StockCheckConfirmForm({ stockCheckId, disabled, items }: { stockCheckId: string; disabled: boolean; items: StockCheckItem[] }) {
  const router = useRouter();
  const [values, setValues] = useState(() => new Map(items.map((item) => [item.id, item.actualStock])));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setItemValue(itemId: string, value: number) {
    setValues((current) => {
      const next = new Map(current);
      next.set(itemId, value);
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await confirmStockCheck({
        stockCheckId,
        items: items.map((item) => ({
          itemId: item.id,
          actualStock: values.get(item.id) ?? item.actualStock,
        })),
      });
      setMessage(result.success ? result.message ?? "盘点已确认" : result.error.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</p> : null}
      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">商品</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">系统库存</th>
                <th className="px-4 py-3 font-medium">实盘库存</th>
                <th className="px-4 py-3 font-medium">差异</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const actual = values.get(item.id) ?? item.actualStock;
                const diff = actual - item.systemStock;
                return (
                  <tr className="border-t border-neutral-100" key={item.id}>
                    <td className="px-4 py-3 font-medium text-neutral-950">{item.name}</td>
                    <td className="px-4 py-3 text-neutral-500">{item.sku}</td>
                    <td className="px-4 py-3 text-neutral-700">{item.systemStock}</td>
                    <td className="px-4 py-3">
                      <input
                        className="form-input h-9 w-28 px-2 disabled:bg-orange-50"
                        disabled={disabled}
                        min={0}
                        onChange={(event) => setItemValue(item.id, Number(event.target.value))}
                        type="number"
                        value={actual}
                      />
                    </td>
                    <td className={diff === 0 ? "px-4 py-3 text-neutral-500" : diff > 0 ? "px-4 py-3 font-semibold text-emerald-700" : "px-4 py-3 font-semibold text-orange-700"}>{diff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {!disabled ? (
        <Button className="bg-orange-500 text-white hover:bg-orange-600" disabled={isPending} onClick={submit} type="button">
          <CheckCircle2 className="h-4 w-4" />
          {isPending ? "确认中" : "确认盘点并调整库存"}
        </Button>
      ) : null}
    </div>
  );
}
