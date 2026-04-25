"use server";

import type { ProductStatus } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { brandSchema, categorySchema, productSchema, type BrandInput, type CategoryInput, type ProductInput } from "@/features/products/schemas";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import { logAction } from "@/features/logs/audit";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: { code: string; message: string } };

function normalizeMoney(value: number | null | undefined) {
  return value === null || value === undefined ? null : value.toFixed(2);
}

function toProductData(input: ProductInput) {
  return {
    sku: input.sku,
    barcode: input.barcode || null,
    name: input.name,
    categoryId: input.categoryId,
    brandId: input.brandId,
    unit: input.unit,
    spec: input.spec || null,
    costPrice: input.costPrice.toFixed(2),
    wholesalePrice: input.wholesalePrice.toFixed(2),
    retailPrice: input.retailPrice.toFixed(2),
    memberPrice: normalizeMoney(input.memberPrice),
    stock: input.stock,
    safeStock: input.safeStock,
    bulkThreshold: input.bulkThreshold,
    description: input.description || null,
    status: input.status,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "操作失败，请稍后重试";
}

function revalidateProductCache() {
  revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
  revalidatePath("/shop");
  revalidatePath("/shop/catalog");
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "产品信息不完整" } };
  }

  try {
    const product = await prisma.product.create({
      data: toProductData(parsed.data),
      select: { id: true, name: true, sku: true, status: true },
    });
    await logAction({ module: "商品", action: "创建商品", targetType: "Product", targetId: product.id, targetName: product.name, after: product, summary: `创建商品 ${product.name}` });
    revalidateProductCache();
    revalidatePath("/dashboard/products");
    return { success: true, message: "产品已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_PRODUCT_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "产品信息不完整" } };
  }

  try {
    const before = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true, sku: true, status: true, retailPrice: true, safeStock: true } });
    const product = await prisma.product.update({
      where: { id },
      data: toProductData(parsed.data),
      select: { id: true, name: true, sku: true, status: true, retailPrice: true, safeStock: true },
    });
    await logAction({ module: "商品", action: "更新商品", targetType: "Product", targetId: product.id, targetName: product.name, before, after: product, summary: `更新商品 ${product.name}` });
    revalidateProductCache();
    revalidatePath("/dashboard/products");
    revalidatePath(`/dashboard/products/${id}`);
    return { success: true, message: "产品已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_PRODUCT_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const product = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true, sku: true } });
    await prisma.product.delete({ where: { id } });
    await logAction({ module: "商品", action: "删除商品", targetType: "Product", targetId: id, targetName: product?.name, before: product, summary: `删除商品 ${product?.name ?? id}` });
    revalidateProductCache();
    revalidatePath("/dashboard/products");
    return { success: true, message: "产品已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_PRODUCT_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateProductStatus(id: string, status: ProductStatus): Promise<ActionResult> {
  try {
    const before = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    const product = await prisma.product.update({ where: { id }, data: { status }, select: { id: true, name: true, status: true } });
    await logAction({ module: "商品", action: "更新商品状态", targetType: "Product", targetId: product.id, targetName: product.name, before, after: product, summary: `${product.name} 状态更新为 ${status}` });
    revalidateProductCache();
    revalidatePath("/dashboard/products");
    return { success: true, message: "产品状态已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_STATUS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "分类信息不完整" } };
  }

  try {
    await prisma.category.create({
      data: {
        name: parsed.data.name,
        parentId: parsed.data.parentId || null,
      },
    });
    revalidateProductCache();
    revalidatePath("/dashboard/products/categories");
    return { success: true, message: "分类已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_CATEGORY_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateCategory(id: string, input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "分类信息不完整" } };
  }

  try {
    await prisma.category.update({
      where: { id },
      data: {
        name: parsed.data.name,
        parentId: parsed.data.parentId || null,
      },
    });
    revalidateProductCache();
    revalidatePath("/dashboard/products/categories");
    return { success: true, message: "分类已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_CATEGORY_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const [childrenCount, productCount] = await Promise.all([
      prisma.category.count({ where: { parentId: id } }),
      prisma.product.count({ where: { categoryId: id } }),
    ]);

    if (childrenCount > 0 || productCount > 0) {
      return {
        success: false,
        error: {
          code: "CATEGORY_IN_USE",
          message: `该分类下有 ${childrenCount} 个子分类、${productCount} 个产品，无法删除`,
        },
      };
    }

    await prisma.category.delete({ where: { id } });
    revalidateProductCache();
    revalidatePath("/dashboard/products/categories");
    return { success: true, message: "分类已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_CATEGORY_FAILED", message: getErrorMessage(error) } };
  }
}

export async function createBrand(input: BrandInput): Promise<ActionResult> {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "品牌信息不完整" } };
  }

  try {
    await prisma.brand.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
    });
    revalidateProductCache();
    revalidatePath("/dashboard/products/brands");
    return { success: true, message: "品牌已创建" };
  } catch (error) {
    return { success: false, error: { code: "CREATE_BRAND_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateBrand(id: string, input: BrandInput): Promise<ActionResult> {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "品牌信息不完整" } };
  }

  try {
    await prisma.brand.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
    });
    revalidateProductCache();
    revalidatePath("/dashboard/products/brands");
    return { success: true, message: "品牌已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_BRAND_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  try {
    const productCount = await prisma.product.count({ where: { brandId: id } });
    if (productCount > 0) {
      return { success: false, error: { code: "BRAND_IN_USE", message: `该品牌下有 ${productCount} 个产品，无法删除` } };
    }

    await prisma.brand.delete({ where: { id } });
    revalidateProductCache();
    revalidatePath("/dashboard/products/brands");
    return { success: true, message: "品牌已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_BRAND_FAILED", message: getErrorMessage(error) } };
  }
}
