"use server";

import { hash } from "bcryptjs";
import { z } from "zod";

import { requireDashboardPermission } from "@/features/auth/guards";
import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "@/lib/revalidate";

const configSchema = z.object({
  values: z.record(z.string(), z.coerce.number().min(0)),
});

const userSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  role: z.enum(["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"]),
  password: z.string().min(6).optional(),
});

const userStatusSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(6),
});

async function requireAdmin() {
  const user = await requireDashboardPermission("settings:manage", "仅管理员可操作系统设置");
  return user.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

export async function saveBusinessConfigs(input: z.infer<typeof configSchema>): Promise<ActionResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "业务参数不正确" } };
  }

  try {
    const adminId = await requireAdmin();
    const before = await prisma.systemConfig.findMany({ where: { key: { in: Object.keys(parsed.data.values) } } });
    await prisma.$transaction(
      Object.entries(parsed.data.values).map(([key, value]) =>
        prisma.systemConfig.upsert({
          where: { key },
          update: { value, updatedById: adminId },
          create: { key, value, label: key, group: "business", updatedById: adminId },
        }),
      ),
    );
    await logAction({
      module: "系统设置",
      action: "保存业务参数",
      targetType: "SystemConfig",
      before,
      after: parsed.data.values,
      summary: "更新业务参数配置",
    });
    revalidatePath("/dashboard/settings");
    return { success: true, message: "业务参数已保存" };
  } catch (error) {
    return { success: false, error: { code: "SAVE_CONFIG_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createStaffUser(input: z.infer<typeof userSchema>): Promise<ActionResult> {
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "用户信息不完整" } };
  }

  try {
    await requireAdmin();
    const password = await hash(parsed.data.password || "admin123", 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        role: parsed.data.role,
        password,
        isActive: true,
      },
      select: { id: true, name: true, phone: true, role: true },
    });
    await logAction({
      module: "用户",
      action: "创建用户",
      targetType: "User",
      targetId: user.id,
      targetName: user.name,
      after: user,
      summary: `创建后台用户 ${user.name}`,
    });
    revalidatePath("/dashboard/settings/users");
    return { success: true, message: "用户已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_USER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function setStaffUserStatus(input: z.infer<typeof userStatusSchema>): Promise<ActionResult> {
  const parsed = userStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "用户状态不正确" } };
  }

  try {
    const adminId = await requireAdmin();
    if (parsed.data.userId === adminId && !parsed.data.isActive) {
      throw new Error("不能禁用当前管理员账号");
    }

    const before = await prisma.user.findUniqueOrThrow({ where: { id: parsed.data.userId }, select: { id: true, name: true, isActive: true } });
    const user = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { isActive: parsed.data.isActive },
      select: { id: true, name: true, isActive: true },
    });
    await logAction({
      module: "用户",
      action: parsed.data.isActive ? "启用用户" : "禁用用户",
      targetType: "User",
      targetId: user.id,
      targetName: user.name,
      before,
      after: user,
      summary: `${parsed.data.isActive ? "启用" : "禁用"}后台用户 ${user.name}`,
    });
    revalidatePath("/dashboard/settings/users");
    return { success: true, message: parsed.data.isActive ? "用户已启用" : "用户已禁用" };
  } catch (error) {
    return { success: false, error: { code: "SET_USER_STATUS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function resetStaffUserPassword(input: z.infer<typeof resetPasswordSchema>): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "新密码至少 6 位" } };
  }

  try {
    await requireAdmin();
    const password = await hash(parsed.data.password, 12);
    const user = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { password },
      select: { id: true, name: true },
    });
    await logAction({
      module: "用户",
      action: "重置密码",
      targetType: "User",
      targetId: user.id,
      targetName: user.name,
      summary: `重置后台用户 ${user.name} 密码`,
    });
    return { success: true, message: "密码已重置" };
  } catch (error) {
    return { success: false, error: { code: "RESET_PASSWORD_FAILED", message: getErrorMessage(error) } };
  }
}
