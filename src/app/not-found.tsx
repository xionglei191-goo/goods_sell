import { Home, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
        <SearchX className="h-8 w-8 text-amber-500" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold text-slate-900">页面未找到</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        您访问的页面不存在或已被移除，请检查地址是否正确。
      </p>
      <Link
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
        href="/"
      >
        <Home className="h-4 w-4" />
        返回首页
      </Link>
    </div>
  );
}
