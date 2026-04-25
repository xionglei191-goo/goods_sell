import { NextResponse } from "next/server";

import { loginMiniProgram, type MiniLoginProfile } from "@/features/wechat/mini";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; profile?: MiniLoginProfile };
    const result = await loginMiniProgram(body.code ?? "", body.profile ?? {});
    const response = NextResponse.json({ success: true, data: result });
    response.cookies.set("huaqi_wechat_token", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "微信登录失败",
      },
      { status: 400 },
    );
  }
}
