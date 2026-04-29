"use server";

import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { prisma } from "@/lib/prisma";

const createSalespersonSchema = z.object({
  name: z.string().trim().min(1, "请输入销售员姓名"),
  phone: z.string().trim().min(1, "请输入手机号"),
  password: z.string().min(6, "初始密码至少 6 位").optional(),
});

const salespersonStatusSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(6, "新密码至少 6 位"),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "ADMIN") {
    throw new Error("仅管理员可维护销售员");
  }
  return session.user.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateSalespersonPaths() {
  revalidatePath("/dashboard/salespeople");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/settings/users");
}

export async function createSalesperson(input: z.infer<typeof createSalespersonSchema>): Promise<ActionResult> {
  const parsed = createSalespersonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "销售员信息不完整" } };
  }

  try {
    await requireAdmin();
    const password = await hash(parsed.data.password || "admin123", 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        password,
        role: "SALESPERSON",
        isActive: true,
      },
      select: { id: true, name: true, phone: true, role: true },
    });

    await logAction({
      module: "销售员",
      action: "创建销售员",
      targetType: "User",
      targetId: user.id,
      targetName: user.name,
      after: user,
      summary: `创建销售员 ${user.name}`,
    });
    revalidateSalespersonPaths();
    return { success: true, message: "销售员已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_SALESPERSON_FAILED", message: getErrorMessage(error) } };
  }
}

export async function setSalespersonStatus(input: z.infer<typeof salespersonStatusSchema>): Promise<ActionResult> {
  const parsed = salespersonStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "销售员状态不正确" } };
  }

  try {
    await requireAdmin();
    const before = await prisma.user.findFirstOrThrow({
      where: { id: parsed.data.userId, role: "SALESPERSON" },
      select: { id: true, name: true, isActive: true },
    });
    const user = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { isActive: parsed.data.isActive },
      select: { id: true, name: true, isActive: true },
    });

    await logAction({
      module: "销售员",
      action: parsed.data.isActive ? "启用销售员" : "禁用销售员",
      targetType: "User",
      targetId: user.id,
      targetName: user.name,
      before,
      after: user,
      summary: `${parsed.data.isActive ? "启用" : "禁用"}销售员 ${user.name}`,
    });
    revalidateSalespersonPaths();
    return { success: true, message: parsed.data.isActive ? "销售员已启用" : "销售员已禁用" };
  } catch (error) {
    return { success: false, error: { code: "SET_SALESPERSON_STATUS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function resetSalespersonPassword(input: z.infer<typeof resetPasswordSchema>): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "新密码至少 6 位" } };
  }

  try {
    await requireAdmin();
    const before = await prisma.user.findFirstOrThrow({
      where: { id: parsed.data.userId, role: "SALESPERSON" },
      select: { id: true },
    });
    const password = await hash(parsed.data.password, 12);
    const user = await prisma.user.update({
      where: { id: before.id },
      data: { password },
      select: { id: true, name: true },
    });

    await logAction({
      module: "销售员",
      action: "重置密码",
      targetType: "User",
      targetId: user.id,
      targetName: user.name,
      summary: `重置销售员 ${user.name} 密码`,
    });
    revalidateSalespersonPaths();
    return { success: true, message: "密码已重置" };
  } catch (error) {
    return { success: false, error: { code: "RESET_SALESPERSON_PASSWORD_FAILED", message: getErrorMessage(error) } };
  }
}
