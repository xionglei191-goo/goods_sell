import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type CheckoutSuccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const params = await searchParams;
  const orderNo = Array.isArray(params.orderNo) ? params.orderNo[0] : params.orderNo;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  return (
    <div className="mx-auto max-w-md rounded-lg bg-white px-5 py-12 text-center shadow-sm ring-1 ring-stone-200">
      <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
      <h1 className="mt-5 text-2xl font-bold text-stone-950">支付成功</h1>
      <p className="mt-2 text-sm text-stone-500">订单已进入总仓处理流程</p>
      {orderNo ? <p className="mt-5 rounded-md bg-stone-50 px-3 py-2 font-mono text-sm text-stone-700">{orderNo}</p> : null}
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
