import { z } from "zod";

export const loginSchema = z.object({
  phone: z.string().min(3, "请输入手机号或管理员账号"),
  password: z.string().min(6, "密码至少 6 位"),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "昵称至少 2 个字符").max(20, "昵称最多 20 个字符"),
    phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的中国大陆手机号"),
    password: z.string().min(6, "密码至少 6 位").max(32, "密码最多 32 位"),
    confirmPassword: z.string().min(6, "请再次输入密码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
