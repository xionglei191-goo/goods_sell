"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { createOfficialMenu } from "@/features/wechat/official";

const staffRoles = new Set(["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"]);

export async function syncOfficialMenu() {
  const session = await auth();
  if (!session?.user.role || !staffRoles.has(session.user.role)) {
    return { success: false as const, error: "无权配置公众号菜单" };
  }

  try {
    const result = await createOfficialMenu();
    revalidatePath("/dashboard/wechat");
    return {
      success: true as const,
      message: result.mocked ? "当前未配置公众号密钥，已写入模拟菜单日志" : "公众号菜单已同步",
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "公众号菜单同步失败",
    };
  }
}
