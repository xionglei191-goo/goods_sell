import type { ProductStatus } from "@prisma/client";

import { demoBrands, demoCategories, demoProducts, type BrandOption, type CategoryOption, type ProductListItem } from "@/features/products/demo-data";
import { prisma } from "@/lib/prisma";

export type { BrandOption, CategoryOption } from "@/features/products/demo-data";

export type ProductFilters = {
  q?: string;
  categoryId?: string;
  brandId?: string;
  status?: ProductStatus;
  page?: number;
  pageSize?: number;
};

export type ProductDetail = ProductListItem & {
  barcode: string | null;
  unit: string;
  spec: string | null;
  costPrice: number;
  wholesalePrice: number;
  memberPrice: number | null;
  safeStock: number;
  description: string | null;
};

export type PaginatedProducts = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

export async function getCategories(): Promise<CategoryOption[]> {
  try {
    return await prisma.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        sortOrder: true,
      },
    });
  } catch {
    return demoCategories;
  }
}

export async function getBrands(): Promise<BrandOption[]> {
  try {
    return await prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });
  } catch {
    return demoBrands;
  }
}

export async function getProducts(filters: ProductFilters = {}): Promise<PaginatedProducts> {
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = filters.pageSize ?? 20;

  try {
    const where = {
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" as const } },
              { sku: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          brand: { select: { name: true } },
          category: { select: { name: true } },
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items: items.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        imageUrl: product.images[0]?.url ?? null,
        categoryId: product.categoryId,
        category: product.category.name,
        brandId: product.brandId,
        brand: product.brand.name,
        retailPrice: Number(product.retailPrice),
        stock: product.stock,
        status: product.status,
        bulkThreshold: product.bulkThreshold,
      })),
      total,
      page,
      pageSize,
    };
  } catch {
    const filtered = demoProducts.filter((product) => {
      const matchesQ = filters.q ? product.name.includes(filters.q) || product.sku.includes(filters.q) : true;
      const matchesStatus = filters.status ? product.status === filters.status : true;
      return matchesQ && matchesStatus;
    });
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }
}

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        images: {
          where: { isPrimary: true },
          select: { url: true },
          take: 1,
        },
      },
    });

    if (!product) {
      return null;
    }

    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      imageUrl: product.images[0]?.url ?? null,
      categoryId: product.categoryId,
      category: product.category.name,
      brandId: product.brandId,
      brand: product.brand.name,
      unit: product.unit,
      spec: product.spec,
      costPrice: Number(product.costPrice),
      wholesalePrice: Number(product.wholesalePrice),
      retailPrice: Number(product.retailPrice),
      memberPrice: product.memberPrice ? Number(product.memberPrice) : null,
      stock: product.stock,
      safeStock: product.safeStock,
      status: product.status,
      bulkThreshold: product.bulkThreshold,
      description: product.description,
    };
  } catch {
    const demo = demoProducts.find((product) => product.id === id) ?? demoProducts[0];
    return {
      ...demo,
      barcode: null,
      unit: "瓶",
      spec: "500ml",
      costPrice: Math.max(demo.retailPrice - 60, 1),
      wholesalePrice: Math.max(demo.retailPrice - 30, 1),
      memberPrice: Math.max(demo.retailPrice - 10, 1),
      safeStock: 24,
      description: "演示产品数据。数据库连接后将展示真实产品信息。",
    };
  }
}
