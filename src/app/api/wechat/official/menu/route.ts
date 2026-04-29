import { NextResponse } from "next/server";

import { requireDashboardPermission } from "@/features/auth/guards";
import { createOfficialMenu } from "@/features/wechat/official";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireDashboardPermission("wechat:manage", "无权配置公众号菜单");
  } catch {
    return NextResponse.json({ success: false, error: "无权配置公众号菜单" }, { status: 403 });
  }

  try {
    const result = await createOfficialMenu();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "公众号菜单配置失败",
      },
      { status: 400 },
    );
  }
}
