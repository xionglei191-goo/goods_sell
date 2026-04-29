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
  const [dealerSubmitted, setDealerSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      accountType: "CONSUMER",
      name: "",
      phone: "",
      password: "",
      confirmPassword: "",
      shopName: "",
      zone: "",
      address: "",
      businessLicense: "",
      notes: "",
      consentAccepted: false,
    },
  });
  const accountType = form.watch("accountType");

  function onSubmit(values: RegisterInput) {
    setError(null);

    startTransition(async () => {
      const result = await registerCustomer(values);
      if (!result.success) {
        setError(result.error.message);
        return;
      }

      if (result.accountType === "DEALER") {
        setDealerSubmitted(true);
        form.reset({
          accountType: "DEALER",
          name: "",
          phone: "",
          password: "",
          confirmPassword: "",
          shopName: "",
          zone: "",
          address: "",
          businessLicense: "",
          notes: "",
          consentAccepted: false,
        });
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

  if (dealerSubmitted) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-emerald-50 p-4 text-sm leading-6 text-emerald-800 ring-1 ring-emerald-100">
          经销商申请已提交。管理员审核并补齐门店档案后，账号会开通经销商端登录。
        </div>
        <Link className="block text-center text-sm font-medium text-[#dc2626] hover:underline" href="/login">
          返回登录页
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
        {[
          { value: "CONSUMER", label: "消费者注册" },
          { value: "DEALER", label: "经销商申请" },
        ].map((item) => (
          <button
            className={
              accountType === item.value
                ? "rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
                : "rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
            }
            key={item.value}
            onClick={() => form.setValue("accountType", item.value as RegisterInput["accountType"], { shouldValidate: true })}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="name">
          {accountType === "DEALER" ? "联系人姓名" : "昵称"}
        </label>
        <input
          id="name"
          autoComplete="name"
          className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
          placeholder={accountType === "DEALER" ? "请输入联系人姓名" : "请输入昵称"}
          {...form.register("name")}
        />
        {form.formState.errors.name ? <p className="text-sm text-red-600">{form.formState.errors.name.message}</p> : null}
      </div>

      {accountType === "DEALER" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="shopName">
              门店名称
            </label>
            <input
              id="shopName"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              placeholder="例如：雨湖区某某烟酒行"
              {...form.register("shopName")}
            />
            {form.formState.errors.shopName ? <p className="text-sm text-red-600">{form.formState.errors.shopName.message}</p> : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="zone">
              所在区域
            </label>
            <input
              id="zone"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              placeholder="雨湖区 / 岳塘区等"
              {...form.register("zone")}
            />
            {form.formState.errors.zone ? <p className="text-sm text-red-600">{form.formState.errors.zone.message}</p> : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="address">
              门店地址
            </label>
            <input
              id="address"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              placeholder="请输入门店详细地址"
              {...form.register("address")}
            />
            {form.formState.errors.address ? <p className="text-sm text-red-600">{form.formState.errors.address.message}</p> : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="businessLicense">
              营业执照号
            </label>
            <input
              id="businessLicense"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              placeholder="可选"
              {...form.register("businessLicense")}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="phone">
          手机号
        </label>
        <input
          id="phone"
          autoComplete="tel"
          className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
          placeholder="请输入手机号"
          {...form.register("phone")}
        />
        {form.formState.errors.phone ? <p className="text-sm text-red-600">{form.formState.errors.phone.message}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
            placeholder="至少 6 位"
            {...form.register("password")}
          />
          {form.formState.errors.password ? <p className="text-sm text-red-600">{form.formState.errors.password.message}</p> : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="confirmPassword">
            确认密码
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
            placeholder="再次输入"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-sm text-red-600">{form.formState.errors.confirmPassword.message}</p>
          ) : null}
        </div>
      </div>

      {accountType === "DEALER" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="notes">
              申请备注
            </label>
            <textarea
              id="notes"
              className="min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-base outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              placeholder="主营品类、配送能力或合作意向"
              {...form.register("notes")}
            />
            {form.formState.errors.notes ? <p className="text-sm text-red-600">{form.formState.errors.notes.message}</p> : null}
          </div>

          <label className="flex items-start gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            <input className="mt-1 h-4 w-4 rounded border-slate-300" type="checkbox" {...form.register("consentAccepted")} />
            <span>确认以上门店和联系方式用于经销商资质审核，审核通过前账号暂不能登录经销商端。</span>
          </label>
          {form.formState.errors.consentAccepted ? (
            <p className="text-sm text-red-600">{form.formState.errors.consentAccepted.message}</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <Button className="h-11 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} type="submit">
        {isPending ? "提交中..." : accountType === "DEALER" ? "提交经销商申请" : "注册并进入商城"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        已有账号？
        <Link className="ml-1 font-medium text-[#dc2626] hover:underline" href="/login">
          去登录
        </Link>
      </p>
    </form>
  );
}
