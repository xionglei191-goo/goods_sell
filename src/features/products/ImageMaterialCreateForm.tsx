"use client";

import { ImageMaterialLicenseStatus } from "@prisma/client";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createImageMaterial } from "@/features/products/image-material-actions";
import type { ProductImageMaterialProductOption } from "@/features/products/queries";

type ImageMaterialCreateFormProps = {
  products: ProductImageMaterialProductOption[];
};

const licenseOptions: Array<{ value: ImageMaterialLicenseStatus; label: string }> = [
  { value: ImageMaterialLicenseStatus.INTERNAL_DEMO_APPROVED, label: "内部展示授权" },
  { value: ImageMaterialLicenseStatus.SUPPLIER_PROVIDED, label: "供应商提供" },
  { value: ImageMaterialLicenseStatus.BRAND_PROVIDED, label: "品牌方提供" },
  { value: ImageMaterialLicenseStatus.AUTHORIZED, label: "已授权" },
  { value: ImageMaterialLicenseStatus.OWNED, label: "自行拍摄/自有" },
  { value: ImageMaterialLicenseStatus.PUBLIC_DOMAIN, label: "公共领域" },
  { value: ImageMaterialLicenseStatus.CC, label: "CC 授权" },
  { value: ImageMaterialLicenseStatus.PENDING, label: "待确认授权" },
];

export function ImageMaterialCreateForm({ products }: ImageMaterialCreateFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const result = await createImageMaterial(formData);
      if (!result.success) {
        setMessage({ type: "error", text: result.error.message });
        return;
      }

      formRef.current?.reset();
      setMessage({ type: "success", text: result.message ?? "图片素材已登记" });
      router.refresh();
    });
  }

  return (
    <form className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200" encType="multipart/form-data" onSubmit={submit} ref={formRef}>
      <div className="flex items-center gap-2">
        <ImagePlus className="h-5 w-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">新增图片素材</h2>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">商品</span>
          <select className="form-input" disabled={products.length === 0 || isPending} name="productId" required>
            <option value="">选择商品</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">授权状态</span>
          <select className="form-input" defaultValue={ImageMaterialLicenseStatus.INTERNAL_DEMO_APPROVED} disabled={isPending} name="licenseStatus">
            {licenseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">图片 URL</span>
          <input className="form-input" disabled={isPending} name="imageUrl" placeholder="https://... 或 /images/products/..." />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">上传图片</span>
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            disabled={isPending}
            name="imageFile"
            type="file"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">来源名称</span>
          <input className="form-input" disabled={isPending} maxLength={80} name="sourceName" placeholder="品牌方素材包 / 供应商 / 自拍" />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">来源页面</span>
          <input className="form-input" disabled={isPending} name="sourcePage" placeholder="https://..." type="url" />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-700">授权附件</span>
          <input className="form-input" disabled={isPending} name="authAttachmentUrl" placeholder="授权书、素材包说明或合同附件 URL" />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-700">备注</span>
          <textarea className="form-input min-h-20 resize-y py-3" disabled={isPending} maxLength={300} name="notes" placeholder="授权范围、临时展示说明、素材包编号等" />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message ? (
          <p className={message.type === "success" ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{message.text}</p>
        ) : (
          <p className="text-sm text-slate-500">图片 URL 和上传图片至少填写一项。</p>
        )}
        <Button disabled={isPending || products.length === 0} type="submit">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          登记素材
        </Button>
      </div>
    </form>
  );
}
