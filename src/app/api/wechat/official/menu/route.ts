import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createOfficialMenu } from "@/features/wechat/official";

export const runtime = "nodejs";

const staffRoles = new Set(["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"]);

export async function POST() {
  const session = await auth();
  if (!session?.user.role || !staffRoles.has(session.user.role)) {
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
