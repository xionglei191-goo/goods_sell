"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateProfile } from "@/features/shop/actions";
import type { ProfileInput } from "@/features/shop/schemas";

type ProfileFormProps = {
  initial: {
    name: string;
    phone: string;
  };
};

export function ProfileForm({ initial }: ProfileFormProps) {
  const router = useRouter();
  const [input, setInput] = useState<ProfileInput>({ name: initial.name, oldPassword: "", newPassword: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateProfile(input);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "已更新");
      setInput((current) => ({ ...current, oldPassword: "", newPassword: "" }));
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-950">个人信息</h1>
        <p className="mt-1 text-sm text-neutral-500">账号 {initial.phone}</p>
      </div>

      {message ? <p className="rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">{message}</p> : null}

      <section className="space-y-4 shop-block-card p-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700" htmlFor="profile-name">
            昵称
          </label>
          <input className="shop-form-input h-11" id="profile-name" onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))} value={input.name} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700" htmlFor="old-password">
            旧密码
          </label>
          <input className="shop-form-input h-11" id="old-password" onChange={(event) => setInput((current) => ({ ...current, oldPassword: event.target.value }))} type="password" value={input.oldPassword ?? ""} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700" htmlFor="new-password">
            新密码
          </label>
          <input className="shop-form-input h-11" id="new-password" onChange={(event) => setInput((current) => ({ ...current, newPassword: event.target.value }))} type="password" value={input.newPassword ?? ""} />
        </div>
        <Button className="h-11 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={submit}>
          {isPending ? "保存中" : "保存修改"}
        </Button>
      </section>
    </div>
  );
}
