import { NextResponse, type NextRequest } from "next/server";

import { addressSchema } from "@/features/shop/schemas";
import { requireWechatSession } from "@/features/wechat/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function authError() {
  return NextResponse.json({ success: false, error: "请先完成微信登录" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const addresses = await prisma.address.findMany({
      where: { customerId: session.customerId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: addresses });
  } catch {
    return authError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = requireWechatSession(request);
    const body = await request.json();
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "地址信息不完整");
    }

    const address = await prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { customerId: session.customerId } });
      const shouldDefault = Boolean(parsed.data.isDefault) || count === 0;
      if (shouldDefault) {
        await tx.address.updateMany({ where: { customerId: session.customerId }, data: { isDefault: false } });
      }

      return tx.address.create({
        data: {
          customerId: session.customerId,
          name: parsed.data.name,
          phone: parsed.data.phone,
          province: "湖南省",
          city: "湘潭市",
          district: parsed.data.district,
          detail: parsed.data.detail,
          isDefault: shouldDefault,
        },
      });
    });

    return NextResponse.json({ success: true, data: address });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存地址失败";
    return message === "WECHAT_AUTH_REQUIRED" ? authError() : NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
