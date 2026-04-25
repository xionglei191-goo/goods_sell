import type { PurchaseStatus } from "@prisma/client";

import { demoProducts } from "@/features/products/demo-data";
import { prisma } from "@/lib/prisma";

export type SupplierItem = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

export type PurchaseOrderItem = {
  id: string;
  purchaseNo: string;
  supplier: string;
  status: PurchaseStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
};

export type PurchaseProductOption = {
  id: string;
  name: string;
  sku: string;
  costPrice: number;
};

export async function getSuppliers(): Promise<SupplierItem[]> {
  try {
    return await prisma.supplier.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        contactName: true,
        phone: true,
        address: true,
        isActive: true,
      },
    });
  } catch {
    return [
      {
        id: "demo-supplier",
        name: "湖南华启供应链有限公司",
        contactName: "赵经理",
        phone: "0731-55556666",
        address: "湖南省湘潭市岳塘区产业园",
        isActive: true,
      },
    ];
  }
}

export async function getPurchaseProducts(): Promise<PurchaseProductOption[]> {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, costPrice: true },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      costPrice: Number(product.costPrice),
    }));
  } catch {
    return demoProducts.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      costPrice: Math.max(product.retailPrice - 60, 1),
    }));
  }
}

export async function getPurchaseOrders(): Promise<PurchaseOrderItem[]> {
  try {
    const orders = await prisma.purchaseOrder.findMany({
      include: {
        supplier: { select: { name: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return orders.map((order) => ({
      id: order.id,
      purchaseNo: order.purchaseNo,
      supplier: order.supplier.name,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      itemCount: order.items.length,
      createdAt: order.createdAt.toLocaleString("zh-CN"),
    }));
  } catch {
    return [
      {
        id: "demo-po",
        purchaseNo: "PO202604250001",
        supplier: "湖南华启供应链有限公司",
        status: "SUBMITTED",
        totalAmount: 6120,
        itemCount: 3,
        createdAt: "2026/4/25 10:00",
      },
    ];
  }
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}
