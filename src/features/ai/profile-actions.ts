"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser, requireDashboardPermission } from "@/features/auth/guards";
import { analyzeAllCustomerProfiles, analyzeCustomerProfile } from "@/features/ai/profile-engine";
import type { ActionResult } from "@/features/orders/types";
import { prisma } from "@/lib/prisma";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "画像分析失败";
}

export async function refreshCustomerProfile(customerId: string): Promise<ActionResult> {
  try {
    const user = await requireDashboardPermission("channel:manage", "无权限刷新客户画像");
    if (user.role === "SALESPERSON") {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, salesPersonId: user.id }, select: { id: true } });
      if (!customer) throw new Error("无权限刷新非本人名下客户画像");
    }
    await analyzeCustomerProfile(customerId);
    revalidatePath(`/dashboard/customers/${customerId}`);
    revalidatePath("/dashboard/customers");
    return { success: true, message: "客户画像已更新" };
  } catch (error) {
    return { success: false, error: { code: "PROFILE_REFRESH_FAILED", message: getErrorMessage(error) } };
  }
}

export async function refreshAllCustomerProfiles(): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await getSessionUser();
    if (user?.role !== "ADMIN") {
      throw new Error("仅管理员可批量刷新客户画像");
    }
    const count = await analyzeAllCustomerProfiles();
    revalidatePath("/dashboard/customers");
    return { success: true, message: `已更新 ${count} 位客户画像`, data: { count } };
  } catch (error) {
    return { success: false, error: { code: "PROFILE_REFRESH_ALL_FAILED", message: getErrorMessage(error) } };
  }
}
