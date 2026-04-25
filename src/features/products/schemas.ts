import { ProductStatus } from "@prisma/client";
import { z } from "zod";

const moneySchema = z.coerce.number().nonnegative("金额不能为负数");

export const productSchema = z
  .object({
    sku: z.string().min(2, "请输入 SKU 编码").max(40, "SKU 过长"),
    barcode: z.string().max(64, "条码过长").optional().or(z.literal("")),
    name: z.string().min(2, "请输入产品名称").max(80, "产品名称过长"),
    categoryId: z.string().min(1, "请选择分类"),
    brandId: z.string().min(1, "请选择品牌"),
    unit: z.string().min(1, "请输入单位").max(10, "单位过长"),
    spec: z.string().max(40, "规格过长").optional().or(z.literal("")),
    costPrice: moneySchema,
    wholesalePrice: moneySchema,
    retailPrice: moneySchema,
    memberPrice: moneySchema.optional().nullable(),
    stock: z.coerce.number().int().min(0, "库存不能为负数"),
    safeStock: z.coerce.number().int().min(0, "安全库存不能为负数"),
    bulkThreshold: z.coerce.number().int().min(1, "大单阈值至少为 1"),
    description: z.string().max(500, "描述最多 500 字").optional().or(z.literal("")),
    status: z.nativeEnum(ProductStatus),
  })
  .refine((data) => data.wholesalePrice <= data.retailPrice, {
    message: "批发价不能高于零售价",
    path: ["wholesalePrice"],
  });

export const categorySchema = z.object({
  name: z.string().min(1, "请输入分类名称").max(20, "分类名称过长"),
  parentId: z.string().optional().nullable(),
});

export const brandSchema = z.object({
  name: z.string().min(1, "请输入品牌名称").max(30, "品牌名称过长"),
  description: z.string().max(200, "品牌描述最多 200 字").optional().or(z.literal("")),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductFormValues = z.input<typeof productSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type BrandInput = z.infer<typeof brandSchema>;
