import { z } from "zod";

export const manualOrderItemSchema = z.object({
  productId: z.string().min(1, "请选择商品"),
  quantity: z.coerce.number().int("数量必须是整数").min(1, "数量至少为 1"),
  unitPrice: z.coerce.number().min(0.01, "单价必须大于 0"),
});

export const manualOrderSchema = z.object({
  customerId: z.string().min(1, "请选择客户"),
  addressId: z.string().min(1, "请选择收货地址"),
  type: z.enum(["RETAIL", "WHOLESALE", "GROUP_BUY"]),
  payMethod: z.enum(["WECHAT", "CASH", "TRANSFER", "CREDIT"]),
  remark: z.string().trim().max(200, "备注不超过 200 字").optional(),
  items: z.array(manualOrderItemSchema).min(1, "至少添加一件商品"),
});

export type ManualOrderInput = z.infer<typeof manualOrderSchema>;

export const statusActionSchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(["confirm", "ship", "deliver", "complete", "cancel"]),
});

export type StatusActionInput = z.infer<typeof statusActionSchema>;
