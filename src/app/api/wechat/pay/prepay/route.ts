import { NextResponse, type NextRequest } from "next/server";

import { createWechatJsapiPayment } from "@/features/wechat/pay";
import { requireWechatSession } from "@/features/wechat/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError() {
  return NextResponse.json({ success: false, error: "请先完成微信登录" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const body = (await request.json()) as { orderId?: string };
    if (!body.orderId) throw new Error("缺少订单 ID");

    const order = await prisma.order.findFirst({
      where: { id: body.orderId, customerId: session.customerId },
      select: { id: true, orderNo: true, status: true, payableAmount: true },
    });
    if (!order) throw new Error("订单不存在");
    if (order.status !== "PENDING_PAYMENT") throw new Error("订单当前状态不可支付");

    const prepay = await createWechatJsapiPayment({
      orderNo: order.orderNo,
      amountFen: Math.round(Number(order.payableAmount) * 100),
      openId: session.openId,
      description: `华启商城订单 ${order.orderNo}`,
    });

    await prisma.payment.updateMany({
      where: { orderId: order.id, method: "WECHAT", type: "RECEIVE" },
      data: { transactionId: prepay.prepayId },
    });

    return NextResponse.json({ success: true, data: prepay });
  } catch (error) {
    const message = error instanceof Error ? error.message : "微信预支付失败";
    return message === "WECHAT_AUTH_REQUIRED" ? authError() : NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
