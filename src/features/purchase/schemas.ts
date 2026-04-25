import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().min(1, "请输入供应商名称").max(60, "供应商名称过长"),
  contactName: z.string().max(30, "联系人过长").optional().or(z.literal("")),
  phone: z.string().max(30, "联系电话过长").optional().or(z.literal("")),
  address: z.string().max(120, "地址过长").optional().or(z.literal("")),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "请选择供应商"),
  productId: z.string().min(1, "请选择产品"),
  quantity: z.coerce.number().int().min(1, "数量至少为 1"),
  unitCost: z.coerce.number().nonnegative("采购单价不能为负数"),
  remark: z.string().max(200, "备注最多 200 字").optional().or(z.literal("")),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type PurchaseOrderFormValues = z.input<typeof purchaseOrderSchema>;
