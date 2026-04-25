import { prisma } from "@/lib/prisma";

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function checkNo(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export async function getWarehouseData() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [products, todayRecords, recentRecords, checks] = await Promise.all([
    prisma.product.findMany({
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ stock: "asc" }, { name: "asc" }],
    }),
    prisma.stockRecord.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.stockRecord.findMany({
      include: {
        product: { select: { name: true, sku: true } },
        operator: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.stockCheck.findMany({
      include: {
        operator: { select: { name: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const warningProducts = products
    .filter((product) => product.stock <= product.safeStock)
    .map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand.name,
      category: product.category.name,
      stock: product.stock,
      safeStock: product.safeStock,
      gap: Math.max(0, product.safeStock - product.stock),
    }));

  return {
    summary: {
      totalSku: products.length,
      totalStock: products.reduce((sum, product) => sum + product.stock, 0),
      warningCount: warningProducts.length,
      todayRecords,
    },
    warningProducts,
    recentRecords: recentRecords.map((record) => ({
      id: record.id,
      productName: record.product.name,
      sku: record.product.sku,
      type: record.type,
      quantity: record.quantity,
      beforeStock: record.beforeStock,
      afterStock: record.afterStock,
      operator: record.operator.name,
      remark: record.remark,
      createdAt: record.createdAt.toISOString(),
    })),
    checks: checks.map((check) => ({
      id: check.id,
      checkNo: check.checkNo,
      status: check.status,
      operator: check.operator.name,
      itemCount: check.items.length,
      confirmedAt: check.confirmedAt?.toISOString() ?? null,
      createdAt: check.createdAt.toISOString(),
    })),
    nextCheckHint: `SC${checkNo(new Date())}`,
  };
}

export async function getStockCheckDetail(id: string) {
  const check = await prisma.stockCheck.findUnique({
    where: { id },
    include: {
      operator: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              stock: true,
              safeStock: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!check) return null;

  return {
    id: check.id,
    checkNo: check.checkNo,
    status: check.status,
    operator: check.operator.name,
    remark: check.remark,
    confirmedAt: check.confirmedAt?.toISOString() ?? null,
    createdAt: check.createdAt.toISOString(),
    items: check.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      currentStock: item.product.stock,
      safeStock: item.product.safeStock,
      systemStock: item.systemStock,
      actualStock: item.actualStock,
      difference: item.difference,
      remark: item.remark,
    })),
  };
}
