import { NextResponse, type NextRequest } from "next/server";

import { createMiniProgramOrder } from "@/features/wechat/order-service";
import { requireWechatSession } from "@/features/wechat/session";
import { orderStatusLabels } from "@/features/shop/utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError() {
  return NextResponse.json({ success: false, error: "请先完成微信登录" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const orders = await prisma.order.findMany({
      where: { customerId: session.customerId },
      include: {
        items: {
          take: 3,
          include: { product: { include: { images: { take: 1, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
        statusLabel: orderStatusLabels[order.status],
        payableAmount: Number(order.payableAmount),
        paidAmount: Number(order.paidAmount),
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          name: item.productName,
          quantity: item.quantity,
          imageUrl: item.product.images[0]?.url ?? null,
        })),
      })),
    });
  } catch {
    return authError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const body = (await request.json()) as {
      addressId?: string;
      cartItemIds?: string[];
      customerCouponId?: string | null;
      remark?: string;
    };
    if (!body.addressId || !body.cartItemIds?.length) {
      throw new Error("缺少收货地址或结算商品");
    }

    const order = await createMiniProgramOrder({
      customerId: session.customerId,
      addressId: body.addressId,
      cartItemIds: body.cartItemIds,
      customerCouponId: body.customerCouponId,
      remark: body.remark,
    });

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "小程序下单失败";
    return message === "WECHAT_AUTH_REQUIRED" ? authError() : NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
