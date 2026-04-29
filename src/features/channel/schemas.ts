import { z } from "zod";

export const scenarioInquirySchema = z.object({
  scene: z.enum(["BANQUET", "GROUP_BUY", "RESTOCK", "GIFT", "NEW_PRODUCT_TRIAL", "RETAIL", "DEALER_JOIN", "OTHER"]),
  source: z.enum(["SHOP", "WECHAT_MINI", "WECHAT_OFFICIAL", "SALESPERSON_CODE", "DEALER_CODE", "AI_INTERACTION", "MANUAL"]).default("SHOP"),
  promoterCode: z.string().trim().max(64).optional(),
  contactName: z.string().trim().min(1, "请填写联系人").max(50, "联系人不超过 50 字"),
  contactPhone: z.string().trim().regex(/^1[3-9]\d{9}$/, "请填写正确的手机号"),
  budget: z.coerce.number().min(0, "预算不能为负数").optional().or(z.literal("").transform(() => undefined)),
  expectedDate: z.string().trim().optional(),
  deliveryAddress: z.string().trim().max(160, "地址不超过 160 字").optional(),
  needsInvoice: z.coerce.boolean().default(false),
  notes: z.string().trim().max(500, "备注不超过 500 字").optional(),
  consentAccepted: z.coerce.boolean().refine(Boolean, "请先同意个人信息用途说明"),
  fields: z.record(z.string(), z.string().trim().max(200)).default({}),
});

export type ScenarioInquiryInput = z.infer<typeof scenarioInquirySchema>;

const optionalId = z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().optional());

export const createQuoteSchema = z.object({
  inquiryId: z.string().trim().min(1, "请选择询价单"),
  totalAmount: z.coerce.number().min(0, "报价金额不能为负数"),
  validUntil: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().optional()),
  content: z.string().trim().min(1, "请填写报价说明").max(1000, "报价说明不超过 1000 字"),
});

export const createPromoterCodeSchema = z
  .object({
    ownerType: z.enum(["SALESPERSON", "DEALER", "CAMPAIGN"]),
    label: z.string().trim().min(1, "请填写推广码名称").max(80, "推广码名称不超过 80 字"),
    code: z.string().trim().max(64, "推广码不超过 64 个字符").optional(),
    scene: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["BANQUET", "GROUP_BUY", "RESTOCK", "GIFT", "NEW_PRODUCT_TRIAL", "RETAIL", "DEALER_JOIN", "OTHER"]).optional(),
    ),
    salespersonId: optionalId,
    dealerId: optionalId,
    campaignId: optionalId,
  })
  .superRefine((data, ctx) => {
    if (data.ownerType === "SALESPERSON" && !data.salespersonId) {
      ctx.addIssue({ code: "custom", message: "请选择业务员", path: ["salespersonId"] });
    }
    if (data.ownerType === "DEALER" && !data.dealerId) {
      ctx.addIssue({ code: "custom", message: "请选择经销商", path: ["dealerId"] });
    }
    if (data.ownerType === "CAMPAIGN" && !data.campaignId) {
      ctx.addIssue({ code: "custom", message: "请选择活动", path: ["campaignId"] });
    }
  });

export const dealerPolicySchema = z
  .object({
    dealerId: z.string().trim().min(1, "缺少经销商"),
    minOrderAmount: z.coerce.number().min(0, "最低订单金额不能为负数"),
    maxOrderAmount: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().min(0, "最高订单金额不能为负数").optional()),
    priceLevel: z.enum(["RETAIL", "WHOLESALE", "VIP"]),
    allowCrossZone: z.coerce.boolean().default(false),
    allowReject: z.coerce.boolean().default(true),
    rejectLimitPerDay: z.coerce.number().int().min(0, "拒单次数不能为负数").max(99, "拒单次数过大"),
    priority: z.coerce.number().int().min(0, "优先级不能为负数").max(999, "优先级过大"),
    brandIds: z.array(z.string().trim().min(1)).default([]),
    notes: z.string().trim().max(500, "备注不超过 500 字").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.maxOrderAmount !== undefined && data.maxOrderAmount < data.minOrderAmount) {
      ctx.addIssue({ code: "custom", message: "最高订单金额不能低于最低订单金额", path: ["maxOrderAmount"] });
    }
  });

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type CreatePromoterCodeInput = z.infer<typeof createPromoterCodeSchema>;
export type DealerPolicyInput = z.infer<typeof dealerPolicySchema>;
