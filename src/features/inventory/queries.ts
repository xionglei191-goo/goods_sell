import type { StockType } from "@prisma/client";

import { demoProducts } from "@/features/products/demo-data";
import { prisma } from "@/lib/prisma";

export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  stock: number;
  safeStock: number;
  costPrice: number;
  value: number;
};

export type StockRecordItem = {
  id: string;
  productName: string;
  sku: string;
  type: StockType;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  operator: string;
  remark: string | null;
  createdAt: string;
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

export function getInventoryStatus(item: Pick<InventoryItem, "safeStock" | "stock">) {
  if (item.stock === 0) return { label: "缺货", tone: "black" as const };
  if (item.stock < item.safeStock) return { label: "预警", tone: "red" as const };
  if (item.stock <= item.safeStock * 1.5) return { label: "偏低", tone: "amber" as const };
  return { label: "充足", tone: "green" as const };
}

export async function getInventoryList(): Promise<InventoryItem[]> {
  try {
    const products = await prisma.product.findMany({
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category.name,
      brand: product.brand.name,
      stock: product.stock,
      safeStock: product.safeStock,
      costPrice: Number(product.costPrice),
      value: Number(product.costPrice) * product.stock,
    }));
  } catch {
    return demoProducts.map((product, index) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      stock: product.stock,
      safeStock: [30, 24, 60, 80][index] ?? 20,
      costPrice: Math.max(product.retailPrice - 60, 1),
      value: Math.max(product.retailPrice - 60, 1) * product.stock,
    }));
  }
}

export async function getStockRecords(filters: { productId?: string; type?: StockType } = {}): Promise<StockRecordItem[]> {
  try {
    const records = await prisma.stockRecord.findMany({
      where: {
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
      },
      include: {
        operator: { select: { name: true } },
        product: { select: { name: true, sku: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return records.map((record) => ({
      id: record.id,
      productName: record.product.name,
      sku: record.product.sku,
      type: record.type,
      quantity: record.quantity,
      beforeStock: record.beforeStock,
      afterStock: record.afterStock,
      operator: record.operator.name,
      remark: record.remark,
      createdAt: record.createdAt.toLocaleString("zh-CN"),
    }));
  } catch {
    return demoProducts.slice(0, 4).map((product, index) => ({
      id: `demo-record-${product.id}`,
      productName: product.name,
      sku: product.sku,
      type: index % 2 === 0 ? "IN" : "OUT",
      quantity: index % 2 === 0 ? 20 : -5,
      beforeStock: product.stock - 20,
      afterStock: product.stock,
      operator: "系统管理员",
      remark: "基础库存流水",
      createdAt: "2026/4/25 10:00",
    }));
  }
}
