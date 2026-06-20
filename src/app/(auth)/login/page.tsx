import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = {
  title: "登录 | 华启商城",
  description: "登录华启商城，湘潭本地批发分销与线上零售平台。",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8f6] px-4 py-10">
      <div className="auth-card w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-[#dc2626] text-xl font-bold text-white">
            华启
          </div>
          <h1 className="text-2xl font-semibold text-neutral-950">华启商城</h1>
          <p className="mt-2 text-sm text-neutral-500">湘潭好物，一键到家</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
