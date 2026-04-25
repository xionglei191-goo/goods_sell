"use client";

import { ProductStatus } from "@prisma/client";
import { Eye, Pencil, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteProduct, updateProductStatus } from "@/features/products/actions";

type ProductRowActionsProps = {
  id: string;
  status: ProductStatus;
};

export function ProductRowActions({ id, status }: ProductRowActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm("确认删除该产品？此操作不可恢复。")) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function toggleStatus() {
    setMessage(null);
    startTransition(async () => {
      const nextStatus = status === ProductStatus.ACTIVE ? ProductStatus.INACTIVE : ProductStatus.ACTIVE;
      const result = await updateProductStatus(id, nextStatus);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild className="h-9 w-9" size="icon" title="查看" variant="ghost">
        <Link href={`/dashboard/products/${id}`}>
          <Eye className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild className="h-9 w-9" size="icon" title="编辑" variant="ghost">
        <Link href={`/dashboard/products/${id}/edit`}>
          <Pencil className="h-4 w-4" />
        </Link>
      </Button>
      <Button className="h-9 w-9" disabled={isPending} onClick={toggleStatus} size="icon" title="上架/下架" variant="ghost">
        <Power className="h-4 w-4" />
      </Button>
      <Button className="h-9 w-9 text-red-600 hover:text-red-700" disabled={isPending} onClick={remove} size="icon" title="删除" variant="ghost">
        <Trash2 className="h-4 w-4" />
      </Button>
      {message ? <span className="sr-only">{message}</span> : null}
    </div>
  );
}
