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

export async function getDealerPilotData() {
  const [salespeople, dealers, salespersonCodes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SALESPERSON" },
      select: { id: true, name: true, phone: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.dealer.findMany({
      select: {
        id: true,
        shopName: true,
        zone: true,
        isAccepting: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            salesPersonId: true,
            salesPerson: { select: { id: true, name: true, phone: true } },
          },
        },
        promoterCodes: {
          where: { isActive: true },
          select: { id: true, code: true, ownerType: true, scene: true, scanCount: true, leadCount: true, orderCount: true },
          orderBy: { createdAt: "desc" },
        },
        leads: { select: { id: true } },
        inquiries: { select: { id: true } },
        routings: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.promoterCode.findMany({
      where: { ownerType: "SALESPERSON", isActive: true, salespersonId: { not: null } },
      select: { id: true, code: true, salespersonId: true, scene: true, scanCount: true, leadCount: true, orderCount: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const dealerCountBySalesperson = new Map<string, number>();
  for (const dealer of dealers) {
    const salespersonId = dealer.customer.salesPersonId;
    if (!salespersonId) continue;
    dealerCountBySalesperson.set(salespersonId, (dealerCountBySalesperson.get(salespersonId) ?? 0) + 1);
  }

  const codeStatsBySalesperson = new Map<string, { codeCount: number; scans: number; leads: number; orders: number }>();
  for (const code of salespersonCodes) {
    if (!code.salespersonId) continue;
    const current = codeStatsBySalesperson.get(code.salespersonId) ?? { codeCount: 0, scans: 0, leads: 0, orders: 0 };
    current.codeCount += 1;
    current.scans += code.scanCount;
    current.leads += code.leadCount;
    current.orders += code.orderCount;
    codeStatsBySalesperson.set(code.salespersonId, current);
  }

  const salespersonItems = salespeople.map((person) => {
    const codeStats = codeStatsBySalesperson.get(person.id) ?? { codeCount: 0, scans: 0, leads: 0, orders: 0 };
    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      isActive: person.isActive,
      assignedDealerCount: dealerCountBySalesperson.get(person.id) ?? 0,
      codeCount: codeStats.codeCount,
      scans: codeStats.scans,
      leads: codeStats.leads,
      orders: codeStats.orders,
    };
  });

  const dealerItems = dealers.map((dealer) => {
    const generalCode = dealer.promoterCodes.find((code) => code.ownerType === "DEALER" && code.scene === null) ?? null;
    const scans = dealer.promoterCodes.reduce((sum, code) => sum + code.scanCount, 0);
    const leads = dealer.promoterCodes.reduce((sum, code) => sum + code.leadCount, 0);
    const orders = dealer.promoterCodes.reduce((sum, code) => sum + code.orderCount, 0);
    return {
      id: dealer.id,
      shopName: dealer.shopName,
      zone: dealer.zone,
      isAccepting: dealer.isAccepting,
      customerName: dealer.customer.name,
      customerPhone: dealer.customer.phone,
      salespersonId: dealer.customer.salesPersonId,
      salespersonName: dealer.customer.salesPerson?.name ?? "未绑定",
      generalCode: generalCode?.code ?? null,
      codeCount: dealer.promoterCodes.length,
      scans,
      leads,
      inquiries: dealer.inquiries.length,
      orders,
      acceptedOrders: dealer.routings.filter((routing) => routing.status === "ACCEPTED").length,
    };
  });

  return {
    summary: {
      salespeople: salespersonItems.length,
      activeSalespeople: salespersonItems.filter((item) => item.isActive).length,
      dealers: dealerItems.length,
      assignedDealers: dealerItems.filter((item) => item.salespersonId).length,
      unassignedDealers: dealerItems.filter((item) => !item.salespersonId).length,
      activeCodes: salespersonCodes.length + dealerItems.reduce((sum, item) => sum + item.codeCount, 0),
    },
    salespeople: salespersonItems,
    dealers: dealerItems,
  };
}

export type DealerPilotData = Awaited<ReturnType<typeof getDealerPilotData>>;
