"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createCategory, deleteCategory, updateCategory } from "@/features/products/actions";
import type { CategoryOption } from "@/features/products/queries";

type CategoryManagerProps = {
  categories: CategoryOption[];
};

export function CategoryManager({ categories }: CategoryManagerProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addCategory() {
    setMessage(null);
    startTransition(async () => {
      const result = await createCategory({ name, parentId: parentId || null });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      setName("");
      setParentId("");
      router.refresh();
    });
  }

  function removeCategory(id: string) {
    if (!window.confirm("确认删除该分类？有关联产品或子分类时会被阻止。")) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function editCategory(category: CategoryOption) {
    const nextName = window.prompt("请输入新的分类名称", category.name);
    if (!nextName || nextName === category.name) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await updateCategory(category.id, { name: nextName, parentId: category.parentId });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  const rootCategories = categories.filter((category) => category.parentId === null);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">新增分类</h2>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-700">父级分类</span>
            <select className="form-input" onChange={(event) => setParentId(event.target.value)} value={parentId}>
              <option value="">作为一级分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-700">分类名称</span>
            <input className="form-input" onChange={(event) => setName(event.target.value)} placeholder="如：白酒" value={name} />
          </label>
          {message ? <p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</p> : null}
          <Button disabled={isPending || !name} onClick={addCategory} type="button">
            保存分类
          </Button>
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-neutral-950">分类树</h2>
        <div className="mt-5 space-y-3">
          {rootCategories.map((category) => (
            <CategoryNode categories={categories} category={category} key={category.id} onDelete={removeCategory} onEdit={editCategory} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CategoryNode({
  categories,
  category,
  level = 0,
  onDelete,
  onEdit,
}: {
  categories: CategoryOption[];
  category: CategoryOption;
  level?: number;
  onDelete: (id: string) => void;
  onEdit: (category: CategoryOption) => void;
}) {
  const children = categories.filter((item) => item.parentId === category.id);

  return (
    <div style={{ marginLeft: level * 18 }}>
      <div className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2">
        <span className="text-sm font-medium text-neutral-800">{category.name}</span>
        <div className="flex items-center gap-1">
          <Button className="h-8 w-8" onClick={() => onEdit(category)} size="icon" variant="ghost">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => onDelete(category.id)} size="icon" variant="ghost">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {children.length > 0 ? (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <CategoryNode categories={categories} category={child} key={child.id} level={level + 1} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
