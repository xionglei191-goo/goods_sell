import { Suspense } from "react";

import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1e3a5f] px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#1e3a5f] text-xl font-bold text-white">
            华启
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">华启商城</h1>
          <p className="mt-2 text-sm text-slate-500">湘潭好物，一键到家</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
