"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { savePersonalityPreference } from "@/features/ai/fun";
import type { ActionResult } from "@/features/orders/types";
import { prisma } from "@/lib/prisma";

export async function submitPersonalityTest(answers: Record<string, string>): Promise<ActionResult<{ title: string; category: string; description: string }>> {
  const result = await savePersonalityPreference(answers);
  if (!result) {
    return { success: false, error: { code: "AUTH_REQUIRED", message: "请先登录后保存测试结果" } };
  }
  revalidatePath("/shop/fun");
  return { success: true, message: "测试结果已生成", data: result };
}

export async function checkInToday(): Promise<ActionResult<{ points: number; streak: number }>> {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "CONSUMER") {
    return { success: false, error: { code: "AUTH_REQUIRED", message: "请先登录后签到" } };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.checkIn.findUnique({ where: { customerId_date: { customerId: session.user.id, date: today } } });
      if (existing) {
        return { points: existing.points, streak: existing.streak, duplicate: true };
      }
      const previous = await tx.checkIn.findFirst({ where: { customerId: session.user.id }, orderBy: { date: "desc" } });
      const streak = previous && previous.date.getTime() === yesterday.getTime() ? previous.streak + 1 : 1;
      const points = streak >= 30 ? 200 : streak >= 7 ? 50 : 5;
      const checkIn = await tx.checkIn.create({ data: { customerId: session.user.id, date: today, streak, points } });
      await tx.customer.update({ where: { id: session.user.id }, data: { points: { increment: points } } });
      return { points: checkIn.points, streak: checkIn.streak, duplicate: false };
    });
    revalidatePath("/shop/fun");
    return { success: true, message: result.duplicate ? "今天已经签到过了" : "签到成功", data: { points: result.points, streak: result.streak } };
  } catch (error) {
    return { success: false, error: { code: "CHECK_IN_FAILED", message: error instanceof Error ? error.message : "签到失败" } };
  }
}
