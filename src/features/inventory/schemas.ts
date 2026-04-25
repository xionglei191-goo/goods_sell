import { z } from "zod";

export const stockMovementSchema = z.object({
  productId: z.string().min(1, "请选择产品"),
  quantity: z.coerce.number().int().min(1, "数量至少为 1"),
  remark: z.string().max(200, "备注最多 200 字").optional().or(z.literal("")),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockMovementFormValues = z.input<typeof stockMovementSchema>;
