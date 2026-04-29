"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDashboardPermission } from "@/features/auth/guards";
import { logAction } from "@/features/logs/audit";
import type { ActionResult } from "@/features/orders/types";
import { prisma } from "@/lib/prisma";

const approveDealerApplicationSchema = z.object({
  leadId: z.string().trim().min(1, "缺少申请线索"),
  shopName: z.string().trim().min(2, "请填写门店名称"),
  zone: z.string().trim().min(1, "请填写所在区域"),
  latitude: z.coerce.number().min(-90).max(90, "纬度不正确"),
  longitude: z.coerce.number().min(-180).max(180, "经度不正确"),
  serviceRadius: z.coerce.number().int().min(500).max(50000),
  businessLicense: z.string().trim().optional(),
  salesPersonId: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional(),
});

const rejectDealerApplicationSchema = z.object({
  leadId: z.string().trim().min(1, "缺少申请线索"),
  reason: z.string().trim().min(2, "请填写驳回原因").max(300),
});

export type ApproveDealerApplicationInput = z.infer<typeof approveDealerApplicationSchema>;
export type RejectDealerApplicationInput = z.infer<typeof rejectDealerApplicationSchema>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function inputJsonObject(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function revalidateDealers() {
  revalidatePath("/dashboard/dealers");
  revalidatePath("/dashboard/leads");
}

export async function approveDealerApplication(input: ApproveDealerApplicationInput): Promise<ActionResult<{ dealerId: string }>> {
  const parsed = approveDealerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "审核信息不完整" } };
  }

  try {
    const operator = await requireDashboardPermission("dealers:approve", "无权限审核经销商申请");
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: parsed.data.leadId },
        include: {
          customer: { select: { id: true, type: true, dealer: { select: { id: true } } } },
        },
      });

      if (!lead || lead.scene !== "DEALER_JOIN") {
        throw new Error("经销商申请不存在");
      }
      if (lead.status === "CONVERTED") {
        throw new Error("该申请已通过");
      }
      if (lead.status === "LOST") {
        throw new Error("该申请已驳回");
      }
      if (!lead.customer || lead.customer.type !== "DEALER") {
        throw new Error("申请未关联经销商客户账号");
      }
      if (lead.customer.dealer) {
        throw new Error("该客户已存在经销商档案");
      }

      const dealer = await tx.dealer.create({
        data: {
          customerId: lead.customer.id,
          shopName: parsed.data.shopName,
          businessLicense: parsed.data.businessLicense || null,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          serviceRadius: parsed.data.serviceRadius,
          zone: parsed.data.zone,
          isAccepting: true,
        },
        select: { id: true, shopName: true },
      });

      await tx.customer.update({
        where: { id: lead.customer.id },
        data: {
          isVerified: true,
          salesPersonId: parsed.data.salesPersonId || lead.salespersonId || null,
        },
      });

      const metadata = jsonObject(lead.metadata);
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: "CONVERTED",
          dealerId: dealer.id,
          salespersonId: parsed.data.salesPersonId || lead.salespersonId || null,
          metadata: inputJsonObject({
            ...metadata,
            approval: {
              approvedAt: new Date().toISOString(),
              approvedBy: operator.id,
              shopName: parsed.data.shopName,
              zone: parsed.data.zone,
              latitude: parsed.data.latitude,
              longitude: parsed.data.longitude,
              serviceRadius: parsed.data.serviceRadius,
              notes: parsed.data.notes || null,
            },
          }),
        },
      });

      return { dealerId: dealer.id, shopName: dealer.shopName };
    });

    await logAction({
      module: "经销商",
      action: "审核通过经销商申请",
      targetType: "Dealer",
      targetId: result.dealerId,
      targetName: result.shopName,
      after: parsed.data,
      summary: `经销商申请已通过：${result.shopName}`,
    });
    revalidateDealers();
    return { success: true, message: "经销商申请已通过", data: { dealerId: result.dealerId } };
  } catch (error) {
    return { success: false, error: { code: "APPROVE_DEALER_APPLICATION_FAILED", message: getErrorMessage(error) } };
  }
}

export async function rejectDealerApplication(input: RejectDealerApplicationInput): Promise<ActionResult> {
  const parsed = rejectDealerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "驳回信息不完整" } };
  }

  try {
    const operator = await requireDashboardPermission("dealers:approve", "无权限审核经销商申请");
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: parsed.data.leadId },
        select: { id: true, scene: true, status: true, customerId: true, name: true, metadata: true },
      });

      if (!lead || lead.scene !== "DEALER_JOIN") {
        throw new Error("经销商申请不存在");
      }
      if (lead.status === "CONVERTED") {
        throw new Error("已通过的申请不能驳回");
      }

      if (lead.customerId) {
        await tx.customer.update({ where: { id: lead.customerId }, data: { isVerified: false } });
      }

      const metadata = jsonObject(lead.metadata);
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: "LOST",
          metadata: inputJsonObject({
            ...metadata,
            rejection: {
              rejectedAt: new Date().toISOString(),
              rejectedBy: operator.id,
              reason: parsed.data.reason,
            },
          }),
        },
        select: { id: true, name: true },
      });
      return updated;
    });

    await logAction({
      module: "经销商",
      action: "驳回经销商申请",
      targetType: "Lead",
      targetId: result.id,
      targetName: result.name ?? "经销商申请",
      after: parsed.data,
      summary: `经销商申请已驳回：${parsed.data.reason}`,
    });
    revalidateDealers();
    return { success: true, message: "经销商申请已驳回" };
  } catch (error) {
    return { success: false, error: { code: "REJECT_DEALER_APPLICATION_FAILED", message: getErrorMessage(error) } };
  }
}
