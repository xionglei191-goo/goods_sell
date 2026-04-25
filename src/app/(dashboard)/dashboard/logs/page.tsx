import Link from "next/link";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClearLogsButton } from "@/features/logs/ClearLogsButton";
import { LogFilters } from "@/features/logs/LogFilters";
import { formatDateTime, getAuditLogData } from "@/features/logs/queries";

export const dynamic = "force-dynamic";

type LogsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LogsPage({ searchParams }: LogsPageProps) {
  const params = await searchParams;
  const data = await getAuditLogData(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">操作日志</h1>
        <p className="mt-1 text-sm text-slate-500">关键操作自动记录，支持筛选、分页、JSON 详情和手动清除。</p>
      </div>

      <ClearLogsButton />
      <LogFilters initial={data.filters} modules={data.modules} />

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">操作人</th>
                <th className="px-4 py-3 font-medium">模块</th>
                <th className="px-4 py-3 font-medium">动作</th>
                <th className="px-4 py-3 font-medium">目标</th>
                <th className="px-4 py-3 font-medium">摘要</th>
                <th className="px-4 py-3 font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log) => (
                <tr className="border-t border-slate-100 align-top" key={log.id}>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{log.operatorName}</td>
                  <td className="px-4 py-3 text-slate-700">{log.module}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{log.action}</td>
                  <td className="px-4 py-3 text-slate-600">{log.targetName ?? log.targetId ?? log.targetType}</td>
                  <td className="px-4 py-3 text-slate-600">{log.summary}</td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-[#dc2626]">JSON</summary>
                      <pre className="mt-2 max-h-64 w-[360px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>共 {data.total} 条，第 {data.page} / {data.pageCount} 页</span>
          <div className="flex gap-2">
            <Button asChild disabled={data.page <= 1} size="sm" variant="outline">
              <Link href={`/dashboard/logs?page=${Math.max(1, data.page - 1)}`}>上一页</Link>
            </Button>
            <Button asChild disabled={data.page >= data.pageCount} size="sm" variant="outline">
              <Link href={`/dashboard/logs?page=${Math.min(data.pageCount, data.page + 1)}`}>下一页</Link>
            </Button>
          </div>
        </div>
      </section>

      {data.logs.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">暂无操作日志。</p>
        </div>
      ) : null}
    </div>
  );
}
