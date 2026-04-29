"use client";

import { ImageMaterialLicenseStatus, ImageMaterialReviewStatus } from "@prisma/client";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { approveImageMaterial, deleteImageMaterial, rejectImageMaterial } from "@/features/products/image-material-actions";

type ImageMaterialActionsProps = {
  id: string;
  licenseStatus: ImageMaterialLicenseStatus;
  reviewStatus: ImageMaterialReviewStatus;
};

const approvable = new Set<ImageMaterialLicenseStatus>([
  ImageMaterialLicenseStatus.AUTHORIZED,
  ImageMaterialLicenseStatus.BRAND_PROVIDED,
  ImageMaterialLicenseStatus.SUPPLIER_PROVIDED,
  ImageMaterialLicenseStatus.OWNED,
  ImageMaterialLicenseStatus.PUBLIC_DOMAIN,
  ImageMaterialLicenseStatus.CC,
  ImageMaterialLicenseStatus.INTERNAL_DEMO_APPROVED,
]);

export function ImageMaterialActions({ id, licenseStatus, reviewStatus }: ImageMaterialActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canApprove = approvable.has(licenseStatus);

  function run(action: "approve" | "reject" | "delete") {
    if (action === "delete" && !window.confirm("确认删除这条图片素材记录？")) return;
    if (action === "reject" && !window.confirm("确认拒绝这条图片素材？")) return;

    setMessage(null);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveImageMaterial(id)
          : action === "reject"
            ? await rejectImageMaterial(id)
            : await deleteImageMaterial(id);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      setMessage(result.message ?? "操作成功");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isPending || !canApprove} onClick={() => run("approve")} size="sm" title={canApprove ? "设为主图" : "授权未确认"} type="button">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {reviewStatus === ImageMaterialReviewStatus.APPROVED ? "重新设主图" : "通过并设主图"}
        </Button>
        <Button disabled={isPending || reviewStatus === ImageMaterialReviewStatus.REJECTED} onClick={() => run("reject")} size="sm" type="button" variant="outline">
          <X className="h-4 w-4" />
          拒绝
        </Button>
        <Button className="text-red-600 hover:text-red-700" disabled={isPending} onClick={() => run("delete")} size="icon" title="删除记录" type="button" variant="ghost">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {message ? <p className={message.includes("失败") || message.includes("不能") ? "text-xs text-red-600" : "text-xs text-emerald-700"}>{message}</p> : null}
    </div>
  );
}
