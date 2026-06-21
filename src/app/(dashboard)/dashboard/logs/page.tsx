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
        <h1 className="text-2xl font-semibold text-neutral-950">操作日志</h1>
        <p className="mt-1 text-sm text-neutral-500">关键操作自动记录，支持筛选、分页、JSON 详情和手动清除。</p>
      </div>

      <ClearLogsButton />
      <LogFilters initial={data.filters} modules={data.modules} />

      <section className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="dashboard-table-head">
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
                <tr className="border-t border-neutral-100 align-top" key={log.id}>
                  <td className="px-4 py-3 text-neutral-500">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-3 text-neutral-700">{log.operatorName}</td>
                  <td className="px-4 py-3 text-neutral-700">{log.module}</td>
                  <td className="px-4 py-3 font-medium text-neutral-950">{log.action}</td>
                  <td className="px-4 py-3 text-neutral-600">{log.targetName ?? log.targetId ?? log.targetType}</td>
                  <td className="px-4 py-3 text-neutral-600">{log.summary}</td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-orange-700">JSON</summary>
                      <pre className="mt-2 max-h-64 w-[360px] overflow-auto rounded-md bg-[#3f2b20] p-3 text-xs text-slate-100">{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm text-neutral-500">
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
        <div className="empty-state p-12">
          <FileText className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-500">暂无操作日志。</p>
        </div>
      ) : null}
    </div>
  );
}
