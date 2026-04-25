"use server";

import { revalidatePath } from "next/cache";

import { analyzeAllCustomerProfiles, analyzeCustomerProfile } from "@/features/ai/profile-engine";
import type { ActionResult } from "@/features/orders/types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "画像分析失败";
}

export async function refreshCustomerProfile(customerId: string): Promise<ActionResult> {
  try {
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
    const count = await analyzeAllCustomerProfiles();
    revalidatePath("/dashboard/customers");
    return { success: true, message: `已更新 ${count} 位客户画像`, data: { count } };
  } catch (error) {
    return { success: false, error: { code: "PROFILE_REFRESH_ALL_FAILED", message: getErrorMessage(error) } };
  }
}
