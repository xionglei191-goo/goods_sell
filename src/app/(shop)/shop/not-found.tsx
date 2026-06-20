import { SearchX } from "lucide-react";
import Link from "next/link";

export default function ShopNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <SearchX className="h-7 w-7 text-amber-500" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-neutral-950">找不到该页面</h2>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        您访问的商品或页面不存在，可能已下架或地址有误。
      </p>
      <Link
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#dc2626] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#b91c1c]"
        href="/shop"
      >
        返回商城首页
      </Link>
    </div>
  );
}
