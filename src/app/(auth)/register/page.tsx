import { RegisterForm } from "@/app/(auth)/register/register-form";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafaf9] px-4 py-10">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-lg ring-1 ring-stone-200 sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-[#dc2626] text-xl font-bold text-white">
            华启
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">注册华启商城</h1>
          <p className="mt-2 text-sm text-slate-500">消费者账号可用于商城下单和订单查询</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
