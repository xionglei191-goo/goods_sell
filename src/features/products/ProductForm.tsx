"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ProductStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createProduct, updateProduct } from "@/features/products/actions";
import type { BrandOption, CategoryOption, ProductDetail } from "@/features/products/queries";
import { productSchema, type ProductFormValues, type ProductInput } from "@/features/products/schemas";

type ProductFormProps = {
  brands: BrandOption[];
  categories: CategoryOption[];
  product?: ProductDetail;
};

function getCategoryParents(categories: CategoryOption[], categoryId?: string) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const chain: CategoryOption[] = [];
  let current = categoryId ? byId.get(categoryId) : undefined;
  while (current) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function ProductForm({ brands, categories, product }: ProductFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const parentChain = getCategoryParents(categories, product?.categoryId);
  const [levelOne, setLevelOne] = useState(parentChain[0]?.id ?? "");
  const [levelTwo, setLevelTwo] = useState(parentChain[1]?.id ?? "");
  const form = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? "",
      name: product?.name ?? "",
      categoryId: product?.categoryId ?? "",
      brandId: product?.brandId ?? brands[0]?.id ?? "",
      unit: product?.unit ?? "瓶",
      spec: product?.spec ?? "",
      costPrice: product?.costPrice ?? 0,
      wholesalePrice: product?.wholesalePrice ?? 0,
      retailPrice: product?.retailPrice ?? 0,
      memberPrice: product?.memberPrice ?? null,
      stock: product?.stock ?? 0,
      safeStock: product?.safeStock ?? 0,
      bulkThreshold: product?.bulkThreshold ?? 10,
      description: product?.description ?? "",
      status: product?.status ?? ProductStatus.ACTIVE,
    },
  });

  const rootCategories = useMemo(() => categories.filter((category) => category.parentId === null), [categories]);
  const secondLevel = useMemo(() => categories.filter((category) => category.parentId === levelOne), [categories, levelOne]);
  const thirdLevel = useMemo(() => categories.filter((category) => category.parentId === levelTwo), [categories, levelTwo]);

  function submit(values: ProductInput) {
    setMessage(null);
    startTransition(async () => {
      const result = product ? await updateProduct(product.id, values) : await createProduct(values);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      router.push("/dashboard/products");
      router.refresh();
    });
  }

  function updateCategory(value: string, level: 1 | 2 | 3) {
    if (level === 1) {
      setLevelOne(value);
      setLevelTwo("");
    }
    if (level === 2) {
      setLevelTwo(value);
    }
    form.setValue("categoryId", value, { shouldValidate: true });
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-5 surface-panel p-5 lg:grid-cols-2">
        <Field label="产品名称" message={form.formState.errors.name?.message}>
          <input className="form-input" placeholder="如：茅台王子酒 酱香型 500ml" {...form.register("name")} />
        </Field>
        <Field label="SKU 编码" message={form.formState.errors.sku?.message}>
          <input className="form-input" placeholder="HQ-BJ-001" {...form.register("sku")} />
        </Field>
        <Field label="条形码" message={form.formState.errors.barcode?.message}>
          <input className="form-input" placeholder="可选" {...form.register("barcode")} />
        </Field>
        <Field label="品牌" message={form.formState.errors.brandId?.message}>
          <select className="form-input" {...form.register("brandId")}>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="一级分类" message={form.formState.errors.categoryId?.message}>
          <select className="form-input" onChange={(event) => updateCategory(event.target.value, 1)} value={levelOne}>
            <option value="">请选择一级分类</option>
            {rootCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="二级分类">
          <select className="form-input" onChange={(event) => updateCategory(event.target.value, 2)} value={levelTwo}>
            <option value="">请选择二级分类</option>
            {secondLevel.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="三级/最终分类">
          <select className="form-input" {...form.register("categoryId")}>
            <option value={levelTwo || levelOne}>使用当前分类</option>
            {thirdLevel.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状态">
          <select className="form-input" {...form.register("status")}>
            <option value={ProductStatus.ACTIVE}>上架</option>
            <option value={ProductStatus.INACTIVE}>下架</option>
            <option value={ProductStatus.OUT_OF_STOCK}>缺货</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-5 surface-panel p-5 lg:grid-cols-4">
        <Field label="进价" message={form.formState.errors.costPrice?.message}>
          <input className="form-input" step="0.01" type="number" {...form.register("costPrice")} />
        </Field>
        <Field label="批发价" message={form.formState.errors.wholesalePrice?.message}>
          <input className="form-input" step="0.01" type="number" {...form.register("wholesalePrice")} />
        </Field>
        <Field label="零售价" message={form.formState.errors.retailPrice?.message}>
          <input className="form-input" step="0.01" type="number" {...form.register("retailPrice")} />
        </Field>
        <Field label="会员价" message={form.formState.errors.memberPrice?.message}>
          <input className="form-input" step="0.01" type="number" {...form.register("memberPrice")} />
        </Field>
      </div>

      <div className="grid gap-5 surface-panel p-5 lg:grid-cols-4">
        <Field label="单位" message={form.formState.errors.unit?.message}>
          <input className="form-input" placeholder="瓶/箱/件" {...form.register("unit")} />
        </Field>
        <Field label="规格" message={form.formState.errors.spec?.message}>
          <input className="form-input" placeholder="500ml/750ml" {...form.register("spec")} />
        </Field>
        <Field label="当前库存" message={form.formState.errors.stock?.message}>
          <input className="form-input" type="number" {...form.register("stock")} />
        </Field>
        <Field label="安全库存" message={form.formState.errors.safeStock?.message}>
          <input className="form-input" type="number" {...form.register("safeStock")} />
        </Field>
        <Field label="大单阈值" message={form.formState.errors.bulkThreshold?.message}>
          <input className="form-input" type="number" {...form.register("bulkThreshold")} />
          <p className="mt-1 text-xs text-neutral-500">超过此数量的订单将由总仓直发</p>
        </Field>
        <div className="lg:col-span-3">
          <Field label="产品描述" message={form.formState.errors.description?.message}>
            <textarea className="form-input min-h-24 resize-y py-3" placeholder="产品卖点、配送说明等" {...form.register("description")} />
          </Field>
        </div>
      </div>

      <div className="empty-state border-dashed p-5 text-left">
        暂无图片。商品主图请在“商品素材”页维护，保存基础资料后可继续上传和审核素材。
      </div>

      {message ? <p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</p> : null}

      <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-[color-mix(in_srgb,var(--dashboard-panel)_88%,var(--dashboard-surface))] py-4 backdrop-blur" style={{ borderColor: "var(--dashboard-line)" }}>
        <Button onClick={() => router.back()} type="button" variant="outline">
          取消
        </Button>
        <Button disabled={isPending} type="submit">
          {isPending ? "保存中..." : "保存产品"}
        </Button>
      </div>
    </form>
  );
}

function Field({ children, label, message }: { children: ReactNode; label: string; message?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-700">
        {label}
        <span className="ml-1 text-orange-500">*</span>
      </span>
      {children}
      {message ? <p className="mt-1 text-sm text-red-600">{message}</p> : null}
    </label>
  );
}
