import type { Prisma } from "@prisma/client";

import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

const revenueStatuses = ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"] as const;

export type SalespersonListItem = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  customerCount: number;
  orderCount: number;
  revenue: number;
  receivable: number;
  avgOrderAmount: number;
  lastOrderAt: string | null;
};

export async function getSalespersonManagementData(searchParams: SearchParams) {
  const filters = {
    q: firstParam(searchParams.q),
    status: firstParam(searchParams.status),
  };

  const where: Prisma.UserWhereInput = {
    role: "SALESPERSON",
    ...(filters.status === "active" ? { isActive: true } : {}),
    ...(filters.status === "inactive" ? { isActive: false } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const salespeople = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      createdAt: true,
      assignedCustomers: { select: { id: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  const salespersonIds = salespeople.map((person) => person.id);
  const orders =
    salespersonIds.length > 0
      ? await prisma.order.findMany({
          where: {
            parentId: null,
            status: { in: [...revenueStatuses] },
            OR: [
              { salesPersonId: { in: salespersonIds } },
              {
                salesPersonId: null,
                customer: { salesPersonId: { in: salespersonIds } },
              },
            ],
          },
          select: {
            id: true,
            salesPersonId: true,
            payableAmount: true,
            paidAmount: true,
            createdAt: true,
            customer: { select: { salesPersonId: true } },
          },
        })
      : [];

  const statMap = new Map<string, { orderCount: number; revenue: number; receivable: number; lastOrderAt: Date | null }>();
  for (const id of salespersonIds) {
    statMap.set(id, { orderCount: 0, revenue: 0, receivable: 0, lastOrderAt: null });
  }

  for (const order of orders) {
    const salespersonId = order.salesPersonId ?? order.customer.salesPersonId;
    if (!salespersonId) continue;

    const current = statMap.get(salespersonId);
    if (!current) continue;

    const payableAmount = Number(order.payableAmount);
    const paidAmount = Number(order.paidAmount);
    current.orderCount += 1;
    current.revenue += payableAmount;
    current.receivable += Math.max(0, payableAmount - paidAmount);
    current.lastOrderAt = !current.lastOrderAt || order.createdAt > current.lastOrderAt ? order.createdAt : current.lastOrderAt;
  }

  const items: SalespersonListItem[] = salespeople.map((person) => {
    const stats = statMap.get(person.id) ?? { orderCount: 0, revenue: 0, receivable: 0, lastOrderAt: null };
    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      isActive: person.isActive,
      createdAt: person.createdAt.toISOString(),
      customerCount: person.assignedCustomers.length,
      orderCount: stats.orderCount,
      revenue: stats.revenue,
      receivable: stats.receivable,
      avgOrderAmount: stats.orderCount > 0 ? stats.revenue / stats.orderCount : 0,
      lastOrderAt: stats.lastOrderAt?.toISOString() ?? null,
    };
  });

  return {
    filters,
    summary: {
      total: items.length,
      active: items.filter((item) => item.isActive).length,
      customers: items.reduce((sum, item) => sum + item.customerCount, 0),
      revenue: items.reduce((sum, item) => sum + item.revenue, 0),
      receivable: items.reduce((sum, item) => sum + item.receivable, 0),
    },
    items,
  };
}
