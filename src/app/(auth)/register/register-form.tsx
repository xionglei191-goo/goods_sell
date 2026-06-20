"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { registerCustomer } from "@/features/auth/actions";
import { registerSchema, type RegisterInput } from "@/features/auth/schemas";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values: RegisterInput) {
    setError(null);

    startTransition(async () => {
      const result = await registerCustomer(values);
      if (!result.success) {
        setError(result.error.message);
        return;
      }

      const loginResult = await signIn("credentials", {
        phone: values.phone,
        password: values.password,
        redirect: false,
      });

      if (!loginResult?.ok) {
        router.replace("/login");
        return;
      }

      router.replace("/shop");
      router.refresh();
    });
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700" htmlFor="name">
          昵称
        </label>
        <input
          id="name"
          autoComplete="name"
          className="shop-form-input h-11 text-base"
          placeholder="请输入昵称"
          {...form.register("name")}
        />
        {form.formState.errors.name ? <p className="text-sm text-red-600">{form.formState.errors.name.message}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700" htmlFor="phone">
          手机号
        </label>
        <input
          id="phone"
          autoComplete="tel"
          className="shop-form-input h-11 text-base"
          placeholder="请输入手机号"
          {...form.register("phone")}
        />
        {form.formState.errors.phone ? <p className="text-sm text-red-600">{form.formState.errors.phone.message}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="shop-form-input h-11 text-base"
            placeholder="至少 6 位"
            {...form.register("password")}
          />
          {form.formState.errors.password ? <p className="text-sm text-red-600">{form.formState.errors.password.message}</p> : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-700" htmlFor="confirmPassword">
            确认密码
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="shop-form-input h-11 text-base"
            placeholder="再次输入"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-sm text-red-600">{form.formState.errors.confirmPassword.message}</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <Button className="h-11 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} type="submit">
        {isPending ? "注册中..." : "注册并进入商城"}
      </Button>

      <p className="text-center text-sm text-neutral-500">
        已有账号？
        <Link className="ml-1 font-medium commerce-accent hover:underline" href="/login">
          去登录
        </Link>
      </p>
    </form>
  );
}
