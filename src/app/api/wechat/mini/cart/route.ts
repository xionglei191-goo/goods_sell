import { NextResponse, type NextRequest } from "next/server";

import { requireWechatSession } from "@/features/wechat/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError() {
  return NextResponse.json({ success: false, error: "请先完成微信登录" }, { status: 401 });
}

function mapCartItem(item: {
  id: string;
  quantity: number;
  selected: boolean;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    spec: string | null;
    retailPrice: unknown;
    stock: number;
    images: Array<{ url: string; alt: string | null }>;
  };
}) {
  return {
    id: item.id,
    productId: item.product.id,
    sku: item.product.sku,
    name: item.product.name,
    spec: item.product.spec ?? item.product.unit,
    price: Number(item.product.retailPrice),
    quantity: item.quantity,
    selected: item.selected,
    stock: item.product.stock,
    imageUrl: item.product.images[0]?.url ?? null,
    subtotal: Number(item.product.retailPrice) * item.quantity,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const items = await prisma.cartItem.findMany({
      where: { customerId: session.customerId },
      include: {
        product: {
          include: {
            images: {
              orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
              select: { url: true, alt: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: items.map(mapCartItem) });
  } catch {
    return authError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const body = (await request.json()) as { productId?: string; quantity?: number; replaceQuantity?: boolean };
    const quantity = Math.max(1, Math.min(999, Number(body.quantity ?? 1)));
    if (!body.productId) throw new Error("缺少商品 ID");

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: { id: true, status: true, stock: true },
    });
    if (!product || product.status !== "ACTIVE") throw new Error("商品已下架");
    if (product.stock < quantity) throw new Error("库存不足，无法加入购物车");

    await prisma.cartItem.upsert({
      where: { customerId_productId: { customerId: session.customerId, productId: body.productId } },
      update: {
        quantity: body.replaceQuantity ? quantity : { increment: quantity },
        selected: true,
      },
      create: {
        customerId: session.customerId,
        productId: body.productId,
        quantity,
        selected: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加入购物车失败";
    return message === "WECHAT_AUTH_REQUIRED" ? authError() : NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const body = (await request.json()) as { itemId?: string; quantity?: number; selected?: boolean };
    if (!body.itemId) throw new Error("缺少购物车条目 ID");

    const data: { quantity?: number; selected?: boolean } = {};
    if (typeof body.quantity === "number") data.quantity = Math.max(1, Math.min(999, body.quantity));
    if (typeof body.selected === "boolean") data.selected = body.selected;

    await prisma.cartItem.updateMany({
      where: { id: body.itemId, customerId: session.customerId },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新购物车失败";
    return message === "WECHAT_AUTH_REQUIRED" ? authError() : NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const body = (await request.json()) as { itemId?: string };
    if (!body.itemId) throw new Error("缺少购物车条目 ID");

    await prisma.cartItem.deleteMany({ where: { id: body.itemId, customerId: session.customerId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除购物车失败";
    return message === "WECHAT_AUTH_REQUIRED" ? authError() : NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
