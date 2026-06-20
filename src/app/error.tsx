"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </span>
      <h1 className="mt-6 text-2xl font-semibold text-neutral-950">出错了</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        页面发生了意外错误，请稍后重试。如果问题持续出现，请联系客服。
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-neutral-400">
          错误代码：{error.digest}
        </p>
      )}
      <button
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-[#dc2626] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#b91c1c]"
        onClick={reset}
        type="button"
      >
        <RefreshCw className="h-4 w-4" />
        重新加载
      </button>
    </div>
  );
}
