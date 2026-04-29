"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createProductPush } from "@/features/marketing/actions";

type ProductPushFormProps = {
  products: Array<{ id: string; label: string; meta: string }>;
  targetTags: Array<{ name: string; count: number }>;
};

export function ProductPushForm({ products, targetTags }: ProductPushFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({ productId: products[0]?.id ?? "", targetTag: targetTags[0]?.name ?? "", message: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const result = await createProductPush(form);
      if (!result.success) {
        setNotice(result.error.message);
        return;
      }
      setNotice(result.message ?? "已生成新品推送");
      router.refresh();
    });
  }

  return (
    <form className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200" onSubmit={submit}>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">创建新品推送</h2>
        <p className="mt-1 text-sm text-slate-500">选择 1 款新品和目标画像，系统会批量生成推送记录。</p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">新品</span>
          <select className="form-input" disabled={isPending || products.length === 0} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} value={form.productId}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </select>
          {products.find((product) => product.id === form.productId)?.meta ? <p className="text-xs text-slate-500">{products.find((product) => product.id === form.productId)?.meta}</p> : null}
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">目标画像</span>
          <select className="form-input" disabled={isPending || targetTags.length === 0} onChange={(event) => setForm((current) => ({ ...current, targetTag: event.target.value }))} value={form.targetTag}>
            {targetTags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}（{tag.count} 人）
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 block space-y-2">
        <span className="text-sm font-medium text-slate-700">推送话术</span>
        <textarea
          className="form-input min-h-24"
          disabled={isPending}
          maxLength={500}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          placeholder="留空则按商品、品牌和画像自动生成。"
          value={form.message}
        />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={isPending || !form.productId || !form.targetTag} type="submit">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          生成推送
        </Button>
        {notice ? <p className="text-sm text-slate-600">{notice}</p> : null}
      </div>
    </form>
  );
}
