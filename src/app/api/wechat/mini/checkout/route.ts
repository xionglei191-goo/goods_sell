import { NextResponse, type NextRequest } from "next/server";

import { calculateCouponDiscount, formatCurrency } from "@/features/shop/utils";
import { requireWechatSession } from "@/features/wechat/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError() {
  return NextResponse.json({ success: false, error: "请先完成微信登录" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const ids = request.nextUrl.searchParams
      .get("cartItemIds")
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const items = await prisma.cartItem.findMany({
      where: {
        customerId: session.customerId,
        ...(ids?.length ? { id: { in: ids } } : { selected: true }),
      },
      include: { product: { include: { images: { take: 1, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } } } },
      orderBy: { updatedAt: "desc" },
    });
    const addresses = await prisma.address.findMany({
      where: { customerId: session.customerId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    const totalAmount = items.reduce((sum, item) => sum + Number(item.product.retailPrice) * item.quantity, 0);
    const coupons = await prisma.customerCoupon.findMany({
      where: { customerId: session.customerId, status: "UNUSED" },
      include: { coupon: true },
      orderBy: { receivedAt: "desc" },
    });
    const now = new Date();

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          name: item.product.name,
          price: Number(item.product.retailPrice),
          quantity: item.quantity,
          imageUrl: item.product.images[0]?.url ?? null,
          subtotal: Number(item.product.retailPrice) * item.quantity,
        })),
        addresses: addresses.map((address) => ({
          id: address.id,
          name: address.name,
          phone: address.phone,
          province: address.province,
          city: address.city,
          district: address.district,
          detail: address.detail,
          isDefault: address.isDefault,
        })),
        totalAmount,
        coupons: coupons.map((item) => {
          const threshold = Number(item.coupon.threshold);
          const discountAmount = calculateCouponDiscount(totalAmount, {
            type: item.coupon.type,
            amount: item.coupon.amount ? Number(item.coupon.amount) : null,
            percent: item.coupon.percent ? Number(item.coupon.percent) : null,
            threshold,
          });
          const isUsable = item.coupon.isActive && item.coupon.startsAt <= now && item.coupon.endsAt >= now && totalAmount >= threshold && discountAmount > 0;
          return {
            id: item.id,
            name: item.coupon.name,
            threshold,
            discountAmount,
            isUsable,
            reason: isUsable ? `可优惠 ${formatCurrency(discountAmount)}` : `满 ${formatCurrency(threshold)} 可用`,
          };
        }),
      },
    });
  } catch {
    return authError();
  }
}
