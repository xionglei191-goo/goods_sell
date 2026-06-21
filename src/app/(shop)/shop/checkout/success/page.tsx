import { CheckCircle2, ClipboardCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type CheckoutSuccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const params = await searchParams;
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const orderNo = Array.isArray(params.orderNo) ? params.orderNo[0] : params.orderNo;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const inquiryNo = Array.isArray(params.inquiryNo) ? params.inquiryNo[0] : params.inquiryNo;

  if (type === "inquiry") {
    return (
      <div className="shop-block-card mx-auto max-w-md px-5 py-12 text-center">
        <ClipboardCheck className="mx-auto h-16 w-16 text-emerald-600" />
        <h1 className="mt-5 text-2xl font-bold text-stone-950">询价已提交</h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">业务员会根据库存、价格、配送和开票要求尽快联系确认报价。</p>
        {inquiryNo ? <p className="mt-5 rounded-md bg-stone-50 px-3 py-2 font-mono text-sm text-stone-700">{inquiryNo}</p> : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button asChild className="bg-[#dc2626] text-white hover:bg-[#b91c1c]">
            <Link href="/shop/scenes/group-buy">继续询价</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/shop">返回首页</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-block-card mx-auto max-w-md px-5 py-12 text-center">
      <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
      <h1 className="mt-5 text-2xl font-bold text-neutral-950">支付成功</h1>
      <p className="mt-2 text-sm text-neutral-500">订单已进入总仓处理流程</p>
      {orderNo ? <p className="mt-5 rounded-md bg-[#fff8f6] px-3 py-2 font-mono text-sm text-neutral-700">{orderNo}</p> : null}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button asChild className="bg-[#dc2626] text-white hover:bg-[#b91c1c]">
          <Link href={orderId ? `/shop/my-orders/${orderId}` : "/shop/my-orders"}>查看订单</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/shop">继续购物</Link>
        </Button>
      </div>
    </div>
  );
}
