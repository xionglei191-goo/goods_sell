import { z } from "zod";

export const loginSchema = z.object({
  phone: z.string().min(3, "请输入手机号或管理员账号"),
  password: z.string().min(6, "密码至少 6 位"),
});

export const registerSchema = z
  .object({
    accountType: z.enum(["CONSUMER", "DEALER"]),
    name: z.string().min(2, "昵称至少 2 个字符").max(20, "昵称最多 20 个字符"),
    phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的中国大陆手机号"),
    password: z.string().min(6, "密码至少 6 位").max(32, "密码最多 32 位"),
    confirmPassword: z.string().min(6, "请再次输入密码"),
    shopName: z.string().trim().optional(),
    zone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    businessLicense: z.string().trim().optional(),
    notes: z.string().trim().max(300, "备注最多 300 字").optional(),
    consentAccepted: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.consentAccepted) {
      ctx.addIssue({ code: "custom", message: "请先阅读并同意服务协议和隐私政策", path: ["consentAccepted"] });
    }

    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: "custom", message: "两次输入的密码不一致", path: ["confirmPassword"] });
    }

    if (data.accountType === "DEALER") {
      if (!data.shopName || data.shopName.length < 2) {
        ctx.addIssue({ code: "custom", message: "请填写门店名称", path: ["shopName"] });
      }
      if (!data.zone) {
        ctx.addIssue({ code: "custom", message: "请选择或填写所在区域", path: ["zone"] });
      }
      if (!data.address) {
        ctx.addIssue({ code: "custom", message: "请填写门店地址", path: ["address"] });
      }
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
