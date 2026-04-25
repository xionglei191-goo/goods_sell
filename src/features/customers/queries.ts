import { notFound } from "next/navigation";
import type { CustomerType, Prisma } from "@prisma/client";

import { firstParam, formatCurrency } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeCustomerType(value: string): CustomerType | undefined {
  return value === "CONSUMER" || value === "DEALER" ? value : undefined;
}

export async function getCustomerList(searchParams: SearchParams) {
  const filters = {
    q: firstParam(searchParams.q),
    type: firstParam(searchParams.type),
    salesPersonId: firstParam(searchParams.salesPersonId),
    tag: firstParam(searchParams.tag),
  };
  const type = normalizeCustomerType(filters.type);
  const where: Prisma.CustomerWhereInput = {
    ...(type ? { type } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.salesPersonId ? { salesPersonId: filters.salesPersonId } : {}),
    ...(filters.tag ? { tags: { some: { name: { contains: filters.tag, mode: "insensitive" } } } } : {}),
  };
  const [customers, salespeople] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        salesPerson: { select: { id: true, name: true } },
        tags: true,
        orders: {
          where: { parentId: null },
          select: { status: true, payableAmount: true, paidAmount: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: "SALESPERSON" },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    filters,
    salespeople,
    items: customers.map((customer) => {
      const completedOrders = customer.orders.filter((order) => order.status === "COMPLETED");
      const totalSpent = completedOrders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
      const debt = customer.orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
      const lastOrder = [...customer.orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        type: customer.type,
        salesPerson: customer.salesPerson?.name ?? "未分配",
        tags: customer.tags.map((tag) => tag.name),
        orderCount: customer.orders.length,
        totalSpent,
        totalSpentText: formatCurrency(totalSpent),
        debt,
        debtText: formatCurrency(debt),
        lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
      };
    }),
  };
}

export async function getCustomerDetail(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      salesPerson: { select: { name: true, phone: true } },
      addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
      tags: true,
      profile: true,
      dealer: true,
      orders: {
        where: { parentId: null },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!customer) {
    notFound();
  }

  const completedOrders = customer.orders.filter((order) => order.status === "COMPLETED");
  const totalSpent = completedOrders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
  const avgOrderAmount = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;
  const debt = customer.orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
  const lastOrder = customer.orders[0];

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      creditLimit: Number(customer.creditLimit),
      balance: Number(customer.balance),
      points: customer.points,
      salesPerson: customer.salesPerson,
      tags: customer.tags,
      profile: customer.profile,
      dealer: customer.dealer
        ? {
            shopName: customer.dealer.shopName,
            zone: customer.dealer.zone,
            serviceRadius: customer.dealer.serviceRadius,
            isAccepting: customer.dealer.isAccepting,
          }
        : null,
    },
    addresses: customer.addresses.map((address) => ({
      id: address.id,
      name: address.name,
      phone: address.phone,
      label: `${address.province}${address.city}${address.district}${address.detail}`,
      isDefault: address.isDefault,
    })),
    stats: {
      orderCount: customer.orders.length,
      completedCount: completedOrders.length,
      totalSpent,
      avgOrderAmount,
      debt,
      lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
    },
    orders: customer.orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      payableAmount: Number(order.payableAmount),
      paidAmount: Number(order.paidAmount),
      createdAt: order.createdAt.toISOString(),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    })),
  };
}
