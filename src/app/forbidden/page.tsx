import Link from "next/link";

import { auth } from "@/auth";
import { getDefaultAuthorizedPath } from "@/features/auth/permissions";

const roleLabels: Record<string, string> = {
  ADMIN: "管理员",
  SALESPERSON: "销售员",
  WAREHOUSE: "仓管",
  FINANCE: "财务",
  CONSUMER: "消费者",
  DEALER: "经销商",
};

type ForbiddenPageProps = {
  searchParams: Promise<{ from?: string }>;
};

export default async function ForbiddenPage({ searchParams }: ForbiddenPageProps) {
  const session = await auth();
  const params = await searchParams;
  const role = session?.user.role;
  const href = getDefaultAuthorizedPath(role);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--dashboard-control)] px-4 py-10">
      <section className="w-full max-w-lg rounded-lg bg-[var(--dashboard-panel)] p-8 shadow-[var(--surface-raised-shadow)] ring-1 ring-[var(--dashboard-line)]">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-amber-100 text-lg font-bold text-amber-700">
          403
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">当前账号无权访问该页面</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          当前角色：{role ? roleLabels[role] ?? role : "未登录或待识别"}。系统已按角色限制后台、经销商端和商城个人功能。
        </p>
        {params.from ? <p className="mt-2 break-all text-xs text-slate-400">来源页面：{params.from}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded-md bg-[#e86f51] px-4 py-2 text-sm font-medium text-white hover:bg-[#cf5638]" href={href}>
            进入可用入口
          </Link>
          <Link className="rounded-md border border-[var(--dashboard-line)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-[var(--dashboard-control)]" href="/login">
            切换账号
          </Link>
        </div>
      </section>
    </main>
  );
}
