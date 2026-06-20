"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createBrand, deleteBrand, updateBrand } from "@/features/products/actions";
import type { BrandOption } from "@/features/products/queries";

type BrandManagerProps = {
  brands: BrandOption[];
};

export function BrandManager({ brands }: BrandManagerProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addBrand() {
    setMessage(null);
    startTransition(async () => {
      const result = await createBrand({ name, description });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      setName("");
      setDescription("");
      router.refresh();
    });
  }

  function removeBrand(id: string) {
    if (!window.confirm("确认删除该品牌？有关联产品时会被阻止。")) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await deleteBrand(id);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function editBrand(brand: BrandOption) {
    const nextName = window.prompt("请输入新的品牌名称", brand.name);
    if (!nextName) {
      return;
    }
    const nextDescription = window.prompt("请输入新的品牌描述", brand.description ?? "") ?? brand.description ?? "";

    setMessage(null);
    startTransition(async () => {
      const result = await updateBrand(brand.id, { name: nextName, description: nextDescription });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">新增品牌</h2>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-700">品牌名称</span>
            <input className="form-input" onChange={(event) => setName(event.target.value)} placeholder="如：茅台" value={name} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-700">品牌描述</span>
            <textarea
              className="form-input min-h-24 resize-y py-3"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="品牌简介"
              value={description}
            />
          </label>
          {message ? <p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</p> : null}
          <Button disabled={isPending || !name} onClick={addBrand} type="button">
            保存品牌
          </Button>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">品牌列表</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-neutral-500">
              <tr className="border-b border-neutral-100">
                <th className="py-3 font-medium">品牌</th>
                <th className="py-3 font-medium">描述</th>
                <th className="py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr className="border-b border-neutral-100 last:border-0" key={brand.id}>
                  <td className="py-3 font-medium text-neutral-950">{brand.name}</td>
                  <td className="py-3 text-neutral-600">{brand.description ?? "-"}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button className="h-8 w-8" onClick={() => editBrand(brand)} size="icon" variant="ghost">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => removeBrand(brand.id)} size="icon" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
