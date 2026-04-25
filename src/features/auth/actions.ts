"use server";

import { CustomerType } from "@prisma/client";
import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { registerSchema, type RegisterInput } from "@/features/auth/schemas";

export type AuthActionResult =
  | { success: true }
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

  await prisma.customer.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      password: await hash(parsed.data.password, 12),
      type: CustomerType.CONSUMER,
      isVerified: true,
      profile: {
        create: {
          preferredCategories: [],
          tags: ["新客"],
        },
      },
    },
  });

  return { success: true };
}
