"use client";

import { CheckCircle2, MapPin, Plus, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { saveAddress, submitOrder } from "@/features/shop/actions";
import type { AddressInput } from "@/features/shop/schemas";
import type { CheckoutData } from "@/features/shop/types";
import { formatCouponBenefit, formatCurrency } from "@/features/shop/utils";
import { cn } from "@/lib/utils";

type CheckoutClientProps = {
  data: CheckoutData;
};

const districts = ["雨湖区", "岳塘区", "湘潭县", "湘乡市", "韶山市"];

export function CheckoutClient({ data }: CheckoutClientProps) {
  const router = useRouter();
  const [addressId, setAddressId] = useState(data.defaultAddressId ?? "");
  const [payMethod, setPayMethod] = useState<"WECHAT" | "CASH" | "TRANSFER" | "CREDIT">("WECHAT");
  const [selectedCouponId, setSelectedCouponId] = useState(data.coupons.find((coupon) => coupon.isUsable)?.id ?? "");
  const [remark, setRemark] = useState("");
  const [showAddressForm, setShowAddressForm] = useState(data.addresses.length === 0);
  const [addressInput, setAddressInput] = useState<AddressInput>({ name: "", phone: "", district: "雨湖区", detail: "", isDefault: true });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedCoupon = useMemo(() => data.coupons.find((coupon) => coupon.id === selectedCouponId && coupon.isUsable), [data.coupons, selectedCouponId]);
  const discountAmount = selectedCoupon?.discountAmount ?? 0;
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
        checkoutMode: "DIRECT_ORDER",
        payMethod,
        customerCouponId: selectedCoupon?.id,
        remark,
      });

      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      if (result.data.kind === "INQUIRY") {
        router.push(`/shop/checkout/success?type=inquiry&inquiryNo=${result.data.inquiryNo}`);
        router.refresh();
        return;
      }

      router.push(`/shop/checkout/success?orderNo=${result.data.orderNo}&orderId=${result.data.orderId}`);
      router.refresh();
    });
  }

  if (data.items.length === 0) {
    return (
      <div className="shop-empty-state py-16">
        <h1 className="text-xl font-bold text-neutral-950">暂无可结算商品</h1>
        <p className="mt-2 text-sm text-neutral-500">请选择购物车商品后再结算。</p>
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
          <h1 className="text-2xl font-bold text-neutral-950">确认订单</h1>
          <p className="mt-1 text-sm text-neutral-500">收货地址仅支持湖南省湘潭市</p>
        </div>

        {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

        <section className="shop-block-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-neutral-950">收货地址</h2>
            <Button onClick={() => setShowAddressForm((value) => !value)} size="sm" variant="outline">
              <Plus className="h-4 w-4" />
              新增
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {data.addresses.map((address) => (
              <label className={cn("block rounded-md border p-3", addressId === address.id ? "border-red-200 bg-red-50" : "border-orange-100 bg-[var(--shop-control)]")} key={address.id}>
                <span className="flex items-start gap-3">
                  <input checked={addressId === address.id} className="mt-1 h-4 w-4 accent-red-800" onChange={() => setAddressId(address.id)} type="radio" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-neutral-950">
                      {address.name} {address.phone}
                      {address.isDefault ? <span className="ml-2 shop-tag-promo">默认</span> : null}
                    </span>
                    <span className="mt-1 block text-sm text-neutral-600">
                      {address.province}{address.city}{address.district}{address.detail}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>

          {showAddressForm ? (
            <div className="mt-4 grid gap-3 rounded-md bg-[#fff8f6] p-3 sm:grid-cols-2">
              <input className="shop-form-input h-10" onChange={(event) => setAddressInput((current) => ({ ...current, name: event.target.value }))} placeholder="收货人" value={addressInput.name} />
              <input className="shop-form-input h-10" onChange={(event) => setAddressInput((current) => ({ ...current, phone: event.target.value }))} placeholder="联系电话" value={addressInput.phone} />
              <select className="shop-form-input h-10" onChange={(event) => setAddressInput((current) => ({ ...current, district: event.target.value }))} value={addressInput.district}>
                {districts.map((district) => (
                  <option key={district} value={district}>
                    湘潭市 {district}
                  </option>
                ))}
              </select>
              <input className="shop-form-input h-10" onChange={(event) => setAddressInput((current) => ({ ...current, detail: event.target.value }))} placeholder="详细地址" value={addressInput.detail} />
              <label className="flex items-center gap-2 text-sm text-neutral-600 sm:col-span-2">
                <input checked={addressInput.isDefault} className="h-4 w-4 accent-red-800" onChange={(event) => setAddressInput((current) => ({ ...current, isDefault: event.target.checked }))} type="checkbox" />
                设为默认地址
              </label>
              <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c] sm:col-span-2" disabled={isPending} onClick={createAddress} type="button">
                保存地址
              </Button>
            </div>
          ) : null}
        </section>

        <section className="shop-block-card p-4">
          <h2 className="font-bold text-neutral-950">商品清单</h2>
          <div className="mt-3 divide-y divide-neutral-100">
            {data.items.map((item) => (
              <div className="flex items-start justify-between gap-3 py-3" key={item.id}>
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium text-neutral-950">{item.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.spec ?? item.unit} · x{item.quantity}</p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-neutral-950">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="shop-block-card p-4">
          <h2 className="font-bold text-neutral-950">支付方式</h2>
          <div className="mt-3 grid gap-2">
            {[
              ["WECHAT", "模拟支付"],
              ["CASH", "现金"],
              ["TRANSFER", "转账"],
              ["CREDIT", "赊账"],
            ].map(([value, label]) => (
              <label className={cn("flex items-center gap-3 rounded-md border px-3 py-2 text-sm", payMethod === value ? "border-red-200 bg-red-50 commerce-accent" : "border-orange-100 bg-[var(--shop-control)] text-neutral-600")} key={value}>
                <input checked={payMethod === value} className="h-4 w-4 accent-red-800" onChange={() => setPayMethod(value as typeof payMethod)} type="radio" />
                {label}
              </label>
            ))}
          </div>
          <textarea className="shop-form-input mt-3 min-h-20 py-2" onChange={(event) => setRemark(event.target.value)} placeholder="订单备注" value={remark} />
        </section>

        <section className="shop-block-card p-4">
          <div className="flex items-center gap-2">
            <TicketPercent className="h-4 w-4 commerce-accent" />
            <h2 className="font-bold text-neutral-950">优惠券</h2>
          </div>
          <select className="shop-form-input mt-3 h-10" onChange={(event) => setSelectedCouponId(event.target.value)} value={selectedCouponId}>
            <option value="">不使用优惠券</option>
            {data.coupons.map((coupon) => (
              <option disabled={!coupon.isUsable} key={coupon.id} value={coupon.id}>
                {coupon.name} · {formatCouponBenefit(coupon)} · {coupon.reason}
              </option>
            ))}
          </select>
          {data.coupons.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">暂无可用优惠券</p>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-neutral-500">
              {data.coupons.slice(0, 3).map((coupon) => (
                <p className={coupon.isUsable ? "text-emerald-700" : ""} key={coupon.id}>
                  {coupon.name}：{coupon.reason}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="shop-block-card p-4">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <MapPin className="h-4 w-4 commerce-accent" />
            湘潭市配送
          </div>
          <div className="mt-4 space-y-2 text-sm text-neutral-600">
            <div className="flex justify-between">
              <span>商品金额</span>
              <span>{formatCurrency(data.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>优惠</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-orange-100 pt-4">
            <span className="font-semibold text-neutral-950">应付</span>
            <span className="text-2xl font-bold commerce-accent">{formatCurrency(payableAmount)}</span>
          </div>
          <Button className="mt-4 h-12 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={!addressId || isPending} onClick={placeOrder}>
            <CheckCircle2 className="h-4 w-4" />
            {isPending ? "提交中" : "模拟支付并下单"}
          </Button>
        </section>
      </aside>
    </div>
  );
}
