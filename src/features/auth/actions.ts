"use server";

import { CustomerType } from "@prisma/client";
import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { registerSchema, type RegisterInput } from "@/features/auth/schemas";

export type AuthActionResult =
  | { success: true; accountType: "CONSUMER"; status: "ACTIVE" }
  | { success: true; accountType: "DEALER"; status: "PENDING_REVIEW" }
  | { success: false; error: { code: string; message: string } };

export async function registerCustomer(input: RegisterInput): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "注册信息不完整",
      },
    };
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { phone: parsed.data.phone },
      select: { id: true },
    });
    const existingCustomer = await prisma.customer.findUnique({
      where: { phone: parsed.data.phone },
      select: { id: true },
    });

    if (existingUser || existingCustomer) {
      return {
        success: false,
        error: {
          code: "PHONE_EXISTS",
          message: "该手机号已注册，请直接登录",
        },
      };
    }

    const password = await hash(parsed.data.password, 12);

    if (parsed.data.accountType === "DEALER") {
      await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            password,
            type: CustomerType.DEALER,
            isVerified: false,
            profile: {
              create: {
                preferredCategories: [],
                tags: { labels: ["画像:潜在经销商", "生命周期:NEW"] },
              },
            },
            tags: {
              create: [
                { name: "画像:潜在经销商", color: "#ede9fe", source: "DEALER_APPLICATION" },
                { name: "经销商申请", color: "#dbeafe", source: "DEALER_APPLICATION" },
              ],
            },
          },
          select: { id: true },
        });

        await tx.lead.create({
          data: {
            source: "SHOP",
            scene: "DEALER_JOIN",
            status: "NEW",
            name: parsed.data.shopName || parsed.data.name,
            phone: parsed.data.phone,
            customerId: customer.id,
            notes: parsed.data.notes || null,
            consentAccepted: Boolean(parsed.data.consentAccepted),
            metadata: {
              accountType: "DEALER_APPLICATION",
              contactName: parsed.data.name,
              shopName: parsed.data.shopName,
              zone: parsed.data.zone,
              address: parsed.data.address,
              businessLicense: parsed.data.businessLicense || null,
              submittedAt: new Date().toISOString(),
            },
          },
        });
      });

      return { success: true, accountType: "DEALER", status: "PENDING_REVIEW" };
    }

    await prisma.customer.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        password,
        type: CustomerType.CONSUMER,
        isVerified: true,
        profile: {
          create: {
            preferredCategories: [],
            tags: { labels: ["画像:普通散客", "生命周期:NEW"] },
          },
        },
        tags: {
          create: {
            name: "画像:普通散客",
            color: "#f1f5f9",
            source: "AI_PROFILE",
          },
        },
      },
    });

    return { success: true, accountType: "CONSUMER", status: "ACTIVE" };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "REGISTER_FAILED",
        message: error instanceof Error ? error.message : "注册失败，请稍后重试",
      },
    };
  }
}
