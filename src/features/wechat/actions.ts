"use server";

import { revalidatePath } from "next/cache";

import { requireDashboardPermission } from "@/features/auth/guards";
import { logAction } from "@/features/logs/audit";
import { createOfficialMenu } from "@/features/wechat/official";

export async function syncOfficialMenu() {
  try {
    await requireDashboardPermission("wechat:manage", "无权配置公众号菜单");
  } catch {
    return { success: false as const, error: "无权配置公众号菜单" };
  }

  try {
    const result = await createOfficialMenu();
    await logAction({
      module: "微信生态",
      action: "同步公众号菜单",
      targetType: "WechatOfficialMenu",
      after: { mocked: result.mocked },
      summary: result.mocked ? "写入模拟公众号菜单日志" : "同步公众号菜单",
    });
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
