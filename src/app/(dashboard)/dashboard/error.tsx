"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log to an error reporting service
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50">
        <AlertTriangle className="h-7 w-7 text-orange-500" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-neutral-950">加载失败</h2>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        后台页面加载时发生错误，请重试或联系管理员。
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-neutral-400">错误代码：{error.digest}</p>
      )}
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#c2410c]"
        onClick={reset}
        type="button"
      >
        <RefreshCw className="h-4 w-4" />
        重新加载
      </button>
    </div>
  );
}
