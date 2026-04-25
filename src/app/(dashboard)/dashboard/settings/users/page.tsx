import Link from "next/link";

import { Button } from "@/components/ui/button";
import { UserManager } from "@/features/settings/UserManager";
import { getUserManagementData } from "@/features/settings/queries";

export const dynamic = "force-dynamic";

export default async function SettingsUsersPage() {
  const data = await getUserManagementData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">用户管理</h1>
          <p className="mt-1 text-sm text-slate-500">后台用户 CRUD、角色分配、启用禁用和密码重置。</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings">返回系统设置</Link>
        </Button>
      </div>
      <UserManager users={data.users} />
    </div>
  );
}
