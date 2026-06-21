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
        router.replace("/login?registered=dealer-pending");
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
        <span className="text-sm font-medium text-neutral-700">账号类型</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: "CONSUMER", label: "消费者", text: "商城下单、订单查询和售后" },
            { value: "DEALER", label: "经销商申请", text: "门店接单、库存上报和结算" },
          ].map((option) => (
            <label
              className={`cursor-pointer rounded-md border px-4 py-3 text-sm transition ${
                accountType === option.value ? "border-red-300 bg-red-50 text-red-950" : "border-orange-100 bg-[#fff8f3] text-neutral-700"
              }`}
              key={option.value}
            >
              <input className="sr-only" type="radio" value={option.value} {...form.register("accountType")} />
              <span className="block font-semibold">{option.label}</span>
              <span className="mt-1 block text-xs text-neutral-500">{option.text}</span>
            </label>
          ))}
        </div>
        {form.formState.errors.accountType ? <p className="text-sm text-red-600">{form.formState.errors.accountType.message}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700" htmlFor="name">
          {accountType === "DEALER" ? "联系人姓名" : "昵称"}
        </label>
        <input
          id="name"
          autoComplete="name"
          className="shop-form-input h-11 text-base"
          placeholder={accountType === "DEALER" ? "请输入门店联系人" : "请输入昵称"}
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

      {accountType === "DEALER" ? (
        <div className="rounded-md border border-orange-100 bg-[#fff8f3] p-4">
          <h2 className="font-semibold text-neutral-950">经销商申请信息</h2>
          <p className="mt-1 text-sm text-neutral-500">提交后进入后台审核，通过后可登录经销商工作台。</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700" htmlFor="shopName">
                门店名称
              </label>
              <input id="shopName" className="shop-form-input h-11 text-base" placeholder="如：莲城便利店" {...form.register("shopName")} />
              {form.formState.errors.shopName ? <p className="text-sm text-red-600">{form.formState.errors.shopName.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700" htmlFor="zone">
                所在区域
              </label>
              <input id="zone" className="shop-form-input h-11 text-base" placeholder="如：岳塘区" {...form.register("zone")} />
              {form.formState.errors.zone ? <p className="text-sm text-red-600">{form.formState.errors.zone.message}</p> : null}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <label className="text-sm font-medium text-neutral-700" htmlFor="address">
              门店地址
            </label>
            <input id="address" className="shop-form-input h-11 text-base" placeholder="请输入详细经营地址" {...form.register("address")} />
            {form.formState.errors.address ? <p className="text-sm text-red-600">{form.formState.errors.address.message}</p> : null}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700" htmlFor="businessLicense">
                营业执照编号
              </label>
              <input id="businessLicense" className="shop-form-input h-11 text-base" placeholder="可选，便于审核" {...form.register("businessLicense")} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700" htmlFor="notes">
                经营备注
              </label>
              <input id="notes" className="shop-form-input h-11 text-base" placeholder="主营品类、配送能力等" {...form.register("notes")} />
              {form.formState.errors.notes ? <p className="text-sm text-red-600">{form.formState.errors.notes.message}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <label className="flex items-start gap-3 rounded-md border border-orange-100 bg-[#fff8f3] px-3 py-3 text-sm text-neutral-600">
        <input className="mt-1 h-4 w-4 shrink-0 accent-red-700" type="checkbox" {...form.register("consentAccepted")} />
        <span>
          我已阅读并同意
          <Link className="mx-1 font-medium text-red-700 hover:underline" href="/terms" target="_blank">
            服务协议
          </Link>
          和
          <Link className="mx-1 font-medium text-red-700 hover:underline" href="/privacy" target="_blank">
            隐私政策
          </Link>
          ，授权平台为注册、下单、经销商审核、配送售后和必要联系处理相关信息。
        </span>
      </label>
      {form.formState.errors.consentAccepted ? <p className="text-sm text-red-600">{form.formState.errors.consentAccepted.message}</p> : null}

      <Button className="h-11 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} type="submit">
        {isPending ? "提交中..." : accountType === "DEALER" ? "提交经销商申请" : "注册并进入商城"}
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
