import { NextResponse, type NextRequest } from "next/server";

import { markWechatOrderPaid } from "@/features/wechat/order-service";
import { parseWechatPayNotification } from "@/features/wechat/pay";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const notification = await parseWechatPayNotification(request);
    if (notification.tradeState !== "SUCCESS") {
      return NextResponse.json({ code: "SUCCESS", message: "非成功支付状态已接收" });
    }

    await markWechatOrderPaid({
      orderNo: notification.orderNo,
      transactionId: notification.transactionId,
      amountFen: notification.amountFen,
    });

    return NextResponse.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    return NextResponse.json(
      {
        code: "FAIL",
        message: error instanceof Error ? error.message : "支付回调处理失败",
      },
      { status: 400 },
    );
  }
}
