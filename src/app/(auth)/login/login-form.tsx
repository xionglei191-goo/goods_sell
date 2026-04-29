"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { getSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { loginSchema, type LoginInput } from "@/features/auth/schemas";
import { getDefaultRedirect, isSafeLocalPath } from "@/features/auth/types";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const callbackUrl = searchParams.get("callbackUrl");
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      password: "",
    },
  });

  function onSubmit(values: LoginInput) {
    setError(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        phone: values.phone,
        password: values.password,
        redirect: false,
      });

      if (!result?.ok) {
        setError("手机号或密码错误；经销商申请需审核通过后才能登录");
        return;
      }

      const session = await getSession();
      const redirectUrl = isSafeLocalPath(callbackUrl) ? callbackUrl : getDefaultRedirect(session?.user.role);
      router.replace(redirectUrl);
      router.refresh();
    });
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="phone">
          手机号 / 管理员账号
        </label>
        <input
          id="phone"
          autoComplete="username"
          className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="admin 或 13800138001"
          {...form.register("phone")}
        />
        {form.formState.errors.phone ? <p className="text-sm text-red-600">{form.formState.errors.phone.message}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          密码
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="请输入密码"
          {...form.register("password")}
        />
        {form.formState.errors.password ? <p className="text-sm text-red-600">{form.formState.errors.password.message}</p> : null}
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <Button className="h-11 w-full bg-[#1e3a5f] text-white hover:bg-[#172f4e]" disabled={isPending} type="submit">
        {isPending ? "登录中..." : "登录"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        还没有账号？
        <Link className="ml-1 font-medium text-[#1e3a5f] hover:underline" href="/register">
          注册账号/经销商申请
        </Link>
      </p>
    </form>
  );
}
