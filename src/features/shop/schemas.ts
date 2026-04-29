import { z } from "zod";

export const quantitySchema = z.coerce.number().int("数量必须是整数").min(1, "数量至少为 1").max(999, "数量过大");

export const addToCartSchema = z.object({
  productId: z.string().min(1, "产品不存在"),
  quantity: quantitySchema,
  replaceQuantity: z.boolean().optional(),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartQuantitySchema = z.object({
  itemId: z.string().min(1),
  quantity: quantitySchema,
});

export const updateCartSelectedSchema = z.object({
  itemId: z.string().min(1),
  selected: z.boolean(),
});

export const addressSchema = z.object({
  name: z.string().trim().min(2, "收货人至少 2 个字符"),
  phone: z.string().trim().min(6, "请输入联系电话"),
  district: z.string().trim().min(2, "请选择或填写区县"),
  detail: z.string().trim().min(4, "请填写详细地址"),
  isDefault: z.boolean().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const checkoutSchema = z.object({
  addressId: z.string().min(1, "请选择收货地址"),
  cartItemIds: z.array(z.string().min(1)).min(1, "请选择要结算的商品"),
  checkoutMode: z.enum(["DIRECT_ORDER", "BANQUET", "GROUP_BUY", "RESTOCK"]).default("DIRECT_ORDER"),
  payMethod: z.enum(["WECHAT", "CASH", "TRANSFER", "CREDIT"]).default("WECHAT"),
  customerCouponId: z.string().min(1).optional(),
  remark: z.string().trim().max(200, "备注不超过 200 字").optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const profileSchema = z
  .object({
    name: z.string().trim().min(2, "昵称至少 2 个字符"),
    oldPassword: z.string().optional(),
    newPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword && data.newPassword.length < 6) {
      ctx.addIssue({
        code: "custom",
        message: "新密码至少 6 位",
        path: ["newPassword"],
      });
    }

    if (data.newPassword && !data.oldPassword) {
      ctx.addIssue({
        code: "custom",
        message: "修改密码需输入旧密码",
        path: ["oldPassword"],
      });
    }
  });

export type ProfileInput = z.infer<typeof profileSchema>;
