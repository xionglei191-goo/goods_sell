"use client";

import { CheckCircle2, ClipboardList, MapPin, Plus, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AlcoholComplianceNotice } from "@/features/shop/AlcoholComplianceNotice";
import { saveAddress, submitOrder } from "@/features/shop/actions";
import type { AddressInput, CheckoutInput } from "@/features/shop/schemas";
import type { CheckoutData } from "@/features/shop/types";
import { formatCouponBenefit, formatCurrency } from "@/features/shop/utils";
import { cn } from "@/lib/utils";

type CheckoutClientProps = {
  data: CheckoutData;
};

const districts = ["雨湖区", "岳塘区", "湘潭县", "湘乡市", "韶山市"];

const checkoutModes: Array<{ value: CheckoutInput["checkoutMode"]; label: string; desc: string }> = [
  { value: "DIRECT_ORDER", label: "普通散单", desc: "小额现货直接支付下单" },
  { value: "BANQUET", label: "宴席配酒", desc: "桌数、预算、配送时间先核价" },
  { value: "GROUP_BUY", label: "企业团购", desc: "福利、节礼、开票和批量配送" },
  { value: "RESTOCK", label: "门店补货", desc: "门店常备货和批量补货" },
];

export function CheckoutClient({ data }: CheckoutClientProps) {
  const router = useRouter();
  const [addressId, setAddressId] = useState(data.defaultAddressId ?? "");
  const [checkoutMode, setCheckoutMode] = useState<CheckoutInput["checkoutMode"]>("DIRECT_ORDER");
  const [payMethod, setPayMethod] = useState<"WECHAT" | "CASH" | "TRANSFER" | "CREDIT">("WECHAT");
  const [selectedCouponId, setSelectedCouponId] = useState(data.coupons.find((coupon) => coupon.isUsable)?.id ?? "");
  const [remark, setRemark] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(data.addresses.length === 0);
  const [addressInput, setAddressInput] = useState<AddressInput>({ name: "", phone: "", district: "雨湖区", detail: "", isDefault: true });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedCoupon = useMemo(() => data.coupons.find((coupon) => coupon.id === selectedCouponId && coupon.isUsable), [data.coupons, selectedCouponId]);
  const hasBulkQuantity = data.items.some((item) => item.quantity >= item.bulkThreshold);
  const autoInquiry = data.totalAmount >= data.bulkOrderAmount || hasBulkQuantity;
  const shouldCreateInquiry = checkoutMode !== "DIRECT_ORDER" || autoInquiry;
  const discountAmount = shouldCreateInquiry ? 0 : (selectedCoupon?.discountAmount ?? 0);
  const payableAmount = Math.max(0, data.totalAmount - discountAmount);

  function createAddress() {
    startTransition(async () => {
      const result = await saveAddress(addressInput);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setAddressId(result.data.addressId);
      setShowAddressForm(false);
      setMessage(result.message ?? "地址已新增");
      router.refresh();
    });
  }

  function placeOrder() {
    setMessage(null);
    startTransition(async () => {
      const result = await submitOrder({
        addressId,
        cartItemIds: data.items.map((item) => item.id),
        checkoutMode,
        payMethod,
        customerCouponId: shouldCreateInquiry ? undefined : selectedCoupon?.id,
        remark,
      });

      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      if (result.data.kind === "INQUIRY") {
        router.push(`/shop/checkout/success?type=inquiry&inquiryNo=${result.data.inquiryNo}&inquiryId=${result.data.inquiryId}`);
      } else {
        router.push(`/shop/checkout/success?orderNo=${result.data.orderNo}&orderId=${result.data.orderId}`);
      }
      router.refresh();
    });
  }

  if (data.items.length === 0) {
    return (
      <div className="rounded-lg bg-white px-4 py-16 text-center shadow-sm ring-1 ring-stone-200">
        <h1 className="text-xl font-bold text-stone-950">暂无可结算商品</h1>
        <p className="mt-2 text-sm text-stone-500">请选择购物车商品后再结算。</p>
        <Button asChild className="mt-6 bg-[#dc2626] text-white hover:bg-[#b91c1c]">
          <Link href="/shop/cart">返回购物车</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-950">确认订单</h1>
          <p className="mt-1 text-sm text-stone-500">收货地址仅支持湖南省湘潭市</p>
        </div>

        {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

        <AlcoholComplianceNotice compact />

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#dc2626]" />
            <h2 className="font-bold text-stone-950">采购类型</h2>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {checkoutModes.map((mode) => (
              <label
                className={cn("block rounded-lg border p-3 text-sm", checkoutMode === mode.value ? "border-red-200 bg-red-50" : "border-stone-200 bg-white")}
                key={mode.value}
              >
                <span className="flex items-start gap-2">
                  <input checked={checkoutMode === mode.value} className="mt-1 h-4 w-4 accent-[#dc2626]" onChange={() => setCheckoutMode(mode.value)} type="radio" />
                  <span>
                    <span className="block font-semibold text-stone-950">{mode.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">{mode.desc}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          {autoInquiry ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              当前商品金额达到 {formatCurrency(data.bulkOrderAmount)} 或存在大单数量，系统将转为询价，报价确认后再生成订单。
            </p>
          ) : null}
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-stone-950">收货地址</h2>
            <Button onClick={() => setShowAddressForm((value) => !value)} size="sm" variant="outline">
              <Plus className="h-4 w-4" />
              新增
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {data.addresses.map((address) => (
              <label className={cn("block rounded-lg border p-3", addressId === address.id ? "border-red-200 bg-red-50" : "border-stone-200 bg-white")} key={address.id}>
                <span className="flex items-start gap-3">
                  <input checked={addressId === address.id} className="mt-1 h-4 w-4 accent-[#dc2626]" onChange={() => setAddressId(address.id)} type="radio" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-stone-950">
                      {address.name} {address.phone}
                      {address.isDefault ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-[#dc2626]">默认</span> : null}
                    </span>
                    <span className="mt-1 block text-sm text-stone-600">
                      {address.province}{address.city}{address.district}{address.detail}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>

          {showAddressForm ? (
            <div className="mt-4 grid gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-2">
              <input className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setAddressInput((current) => ({ ...current, name: event.target.value }))} placeholder="收货人" value={addressInput.name} />
              <input className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setAddressInput((current) => ({ ...current, phone: event.target.value }))} placeholder="联系电话" value={addressInput.phone} />
              <select className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setAddressInput((current) => ({ ...current, district: event.target.value }))} value={addressInput.district}>
                {districts.map((district) => (
                  <option key={district} value={district}>
                    湘潭市 {district}
                  </option>
                ))}
              </select>
              <input className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setAddressInput((current) => ({ ...current, detail: event.target.value }))} placeholder="详细地址" value={addressInput.detail} />
              <label className="flex items-center gap-2 text-sm text-stone-600 sm:col-span-2">
                <input checked={addressInput.isDefault} className="h-4 w-4 accent-[#dc2626]" onChange={(event) => setAddressInput((current) => ({ ...current, isDefault: event.target.checked }))} type="checkbox" />
                设为默认地址
              </label>
              <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c] sm:col-span-2" disabled={isPending} onClick={createAddress} type="button">
                保存地址
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-bold text-stone-950">商品清单</h2>
          <div className="mt-3 divide-y divide-stone-100">
            {data.items.map((item) => (
              <div className="flex items-center justify-between gap-3 py-3" key={item.id}>
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium text-stone-950">{item.name}</p>
                  <p className="mt-1 text-xs text-stone-500">{item.spec ?? item.unit} · x{item.quantity}</p>
                </div>
                <p className="font-semibold text-stone-950">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-bold text-stone-950">支付方式</h2>
          <div className="mt-3 grid gap-2">
            {[
              ["WECHAT", "模拟支付"],
              ["CASH", "现金"],
              ["TRANSFER", "转账"],
              ["CREDIT", "赊账"],
            ].map(([value, label]) => (
              <label className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-sm", payMethod === value ? "border-red-200 bg-red-50 text-[#dc2626]" : "border-stone-200 text-stone-600")} key={value}>
                <input checked={payMethod === value} className="h-4 w-4 accent-[#dc2626]" onChange={() => setPayMethod(value as typeof payMethod)} type="radio" />
                {label}
              </label>
            ))}
          </div>
          <textarea className="mt-3 min-h-20 w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-300" onChange={(event) => setRemark(event.target.value)} placeholder="订单备注" value={remark} />
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <div className="flex items-center gap-2">
            <TicketPercent className="h-4 w-4 text-[#dc2626]" />
            <h2 className="font-bold text-stone-950">优惠券</h2>
          </div>
          <select className="mt-3 h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm outline-none focus:border-red-300" onChange={(event) => setSelectedCouponId(event.target.value)} value={selectedCouponId}>
            <option value="">不使用优惠券</option>
            {data.coupons.map((coupon) => (
              <option disabled={!coupon.isUsable} key={coupon.id} value={coupon.id}>
                {coupon.name} · {formatCouponBenefit(coupon)} · {coupon.reason}
              </option>
            ))}
          </select>
          {shouldCreateInquiry ? <p className="mt-2 text-xs text-stone-500">询价单不会锁定或核销优惠券，正式转订单时再计算优惠。</p> : null}
          {data.coupons.length === 0 ? (
            <p className="mt-2 text-xs text-stone-500">暂无可用优惠券</p>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-stone-500">
              {data.coupons.slice(0, 3).map((coupon) => (
                <p className={coupon.isUsable ? "text-emerald-700" : ""} key={coupon.id}>
                  {coupon.name}：{coupon.reason}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <MapPin className="h-4 w-4 text-[#dc2626]" />
            湘潭市配送
          </div>
          <div className="mt-4 space-y-2 text-sm text-stone-600">
            <div className="flex justify-between">
              <span>商品金额</span>
              <span>{formatCurrency(data.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>优惠</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4">
            <span className="font-semibold text-stone-950">应付</span>
            <span className="text-2xl font-bold text-[#dc2626]">{formatCurrency(payableAmount)}</span>
          </div>
          <Button className="mt-4 h-12 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={!addressId || isPending} onClick={placeOrder}>
            <CheckCircle2 className="h-4 w-4" />
            {isPending ? "提交中" : shouldCreateInquiry ? "提交询价" : "模拟支付并下单"}
          </Button>
        </section>
      </aside>
    </div>
  );
}
