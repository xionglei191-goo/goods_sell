import { NextResponse, type NextRequest } from "next/server";

import { getWechatTokenFromRequest, verifyWechatToken } from "@/features/wechat/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = verifyWechatToken(getWechatTokenFromRequest(request));
    const body = (await request.json()) as { scene?: string; path?: string; title?: string; target?: string };
    const scene = body.scene?.trim() || "shop";
    const path = body.path?.trim() || "/pages/index/index";
    const title = body.title?.trim() || "华启商城";

    await prisma.wechatShareEvent.create({
      data: {
        customerId: token?.customerId,
        openId: token?.openId,
        scene,
        path,
        title,
        target: body.target?.trim() || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "分享记录失败",
      },
      { status: 400 },
    );
  }
}
