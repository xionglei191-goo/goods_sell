"use server";

import type { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDashboardPermission } from "@/features/auth/guards";
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

const dealerPilotBindSchema = z.object({
  salespersonId: z.string().trim().min(1, "请选择业务员"),
  dealerIds: z.array(z.string().trim().min(1)).min(1, "请选择经销商").max(30, "单次最多绑定 30 个经销商"),
  generateSalespersonCode: z.boolean().default(true),
  generateDealerCodes: z.boolean().default(true),
});

async function requireAdmin() {
  const user = await requireDashboardPermission("settings:manage", "仅管理员可维护销售员");
  return user.id;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateSalespersonPaths() {
  revalidatePath("/dashboard/salespeople");
  revalidatePath("/dashboard/channel-pilot");
  revalidatePath("/dashboard/promoters");
  revalidatePath("/dashboard/dealers");
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/settings/users");
}

function codeSeed(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.slice(-4) || Date.now().toString(36).toUpperCase().slice(-4);
}

async function buildUniquePromoterCode(tx: Prisma.TransactionClient, prefix: string, seed: string) {
  const base = `${prefix}${codeSeed(seed)}${Date.now().toString(36).toUpperCase().slice(-6)}`;
  for (let index = 0; index < 20; index += 1) {
    const code = index === 0 ? base : `${base}${String(index).padStart(2, "0")}`;
    const existing = await tx.promoterCode.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  return `${base}${Math.random().toString(36).toUpperCase().slice(2, 6)}`;
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

export async function bindDealerPilot(input: z.infer<typeof dealerPilotBindSchema>): Promise<ActionResult<{ boundCount: number; createdCodeCount: number }>> {
  const parsed = dealerPilotBindSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "试点绑定信息不完整" } };
  }

  try {
    await requireAdmin();
    const dealerIds = Array.from(new Set(parsed.data.dealerIds));
    const salesperson = await prisma.user.findFirst({
      where: { id: parsed.data.salespersonId, role: "SALESPERSON", isActive: true },
      select: { id: true, name: true, phone: true },
    });
    if (!salesperson) {
      throw new Error("业务员不存在或已禁用");
    }

    const dealers = await prisma.dealer.findMany({
      where: { id: { in: dealerIds } },
      select: {
        id: true,
        shopName: true,
        customerId: true,
        customer: { select: { name: true, phone: true, salesPersonId: true } },
      },
    });
    if (dealers.length === 0) {
      throw new Error("未找到可绑定的经销商");
    }

    const createdCodeIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.customer.updateMany({
        where: { id: { in: dealers.map((dealer) => dealer.customerId) } },
        data: { salesPersonId: salesperson.id },
      });

      if (parsed.data.generateSalespersonCode) {
        const existingSalespersonCode = await tx.promoterCode.findFirst({
          where: { ownerType: "SALESPERSON", salespersonId: salesperson.id, scene: "DEALER_JOIN", isActive: true },
          select: { id: true },
        });
        if (!existingSalespersonCode) {
          const code = await buildUniquePromoterCode(tx, "SP", salesperson.phone);
          const created = await tx.promoterCode.create({
            data: {
              code,
              ownerType: "SALESPERSON",
              label: `${salesperson.name} · 地推经销商`,
              scene: "DEALER_JOIN",
              salespersonId: salesperson.id,
            },
            select: { id: true },
          });
          createdCodeIds.push(created.id);
        }
      }

      if (parsed.data.generateDealerCodes) {
        for (const dealer of dealers) {
          const existingDealerCode = await tx.promoterCode.findFirst({
            where: { ownerType: "DEALER", dealerId: dealer.id, scene: null, isActive: true },
            select: { id: true },
          });
          if (existingDealerCode) continue;

          const code = await buildUniquePromoterCode(tx, "DL", dealer.customer.phone);
          const created = await tx.promoterCode.create({
            data: {
              code,
              ownerType: "DEALER",
              label: `${dealer.shopName} · 门店专属码`,
              scene: null,
              dealerId: dealer.id,
            },
            select: { id: true },
          });
          createdCodeIds.push(created.id);
        }
      }
    });

    await logAction({
      module: "销售员",
      action: "绑定试点经销商",
      targetType: "User",
      targetId: salesperson.id,
      targetName: salesperson.name,
      after: {
        salespersonId: salesperson.id,
        dealerIds: dealers.map((dealer) => dealer.id),
        createdCodeCount: createdCodeIds.length,
      },
      summary: `为业务员 ${salesperson.name} 绑定 ${dealers.length} 个试点经销商`,
    });

    revalidateSalespersonPaths();
    return { success: true, message: `已绑定 ${dealers.length} 个经销商，新增 ${createdCodeIds.length} 个推广码`, data: { boundCount: dealers.length, createdCodeCount: createdCodeIds.length } };
  } catch (error) {
    return { success: false, error: { code: "BIND_DEALER_PILOT_FAILED", message: getErrorMessage(error) } };
  }
}
