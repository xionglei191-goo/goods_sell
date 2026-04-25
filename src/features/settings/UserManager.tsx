"use client";

import { KeyRound, Plus, Power } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createStaffUser, resetStaffUserPassword, setStaffUserStatus } from "@/features/settings/actions";

type UserRow = {
  id: string;
  name: string;
  phone: string;
  role: "ADMIN" | "SALESPERSON" | "WAREHOUSE" | "FINANCE";
  isActive: boolean;
  createdAt: string;
};

const roleLabels = {
  ADMIN: "管理员",
  SALESPERSON: "销售",
  WAREHOUSE: "仓库",
  FINANCE: "财务",
} as const;

export function UserManager({ users }: { users: UserRow[] }) {
  const [form, setForm] = useState({ name: "", phone: "", role: "SALESPERSON" as UserRow["role"], password: "admin123" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function createUser() {
    startTransition(async () => {
      const result = await createStaffUser(form);
      setMessage(result.success ? result.message ?? "用户已创建" : result.error.message);
    });
  }

  function toggleStatus(user: UserRow) {
    startTransition(async () => {
      const result = await setStaffUserStatus({ userId: user.id, isActive: !user.isActive });
      setMessage(result.success ? result.message ?? "状态已更新" : result.error.message);
    });
  }

  function resetPassword(user: UserRow) {
    startTransition(async () => {
      const result = await resetStaffUserPassword({ userId: user.id, password: "admin123" });
      setMessage(result.success ? `${user.name} 密码已重置为 admin123` : result.error.message);
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">新增后台用户</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="姓名" value={form.name} />
          <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="账号/手机号" value={form.phone} />
          <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRow["role"] }))} value={form.role}>
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="初始密码" value={form.password} />
        </div>
        <Button className="mt-4 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={createUser} type="button">
          <Plus className="h-4 w-4" />
          创建用户
        </Button>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">账号</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-t border-slate-100" key={user.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                  <td className="px-4 py-3 text-slate-600">{user.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{roleLabels[user.role]}</td>
                  <td className="px-4 py-3">
                    <span className={user.isActive ? "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500"}>{user.isActive ? "启用" : "禁用"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button disabled={isPending} onClick={() => resetPassword(user)} size="sm" type="button" variant="outline">
                        <KeyRound className="h-4 w-4" />
                        重置
                      </Button>
                      <Button disabled={isPending} onClick={() => toggleStatus(user)} size="sm" type="button" variant="outline">
                        <Power className="h-4 w-4" />
                        {user.isActive ? "禁用" : "启用"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
