import { notFound } from "next/navigation";
import type { CustomerType, Prisma } from "@prisma/client";

import { getSessionUser } from "@/features/auth/guards";
import { evaluateCustomerSegment, type CustomerSegment } from "@/features/customers/segmentation";
import { firstParam, formatCurrency } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeCustomerType(value: string): CustomerType | undefined {
  return value === "CONSUMER" || value === "DEALER" ? value : undefined;
}

const customerSegments = ["HIGH_VALUE_GROUP_BUY", "RESTAURANT", "TOBACCO_WINE_STORE", "BANQUET", "REGULAR"] as const;

function normalizeSegment(value: string): CustomerSegment | undefined {
  return customerSegments.includes(value as CustomerSegment) ? (value as CustomerSegment) : undefined;
}

export async function getCustomerList(searchParams: SearchParams) {
  const user = await getSessionUser();
  const filters = {
    q: firstParam(searchParams.q),
    type: firstParam(searchParams.type),
    salesPersonId: firstParam(searchParams.salesPersonId),
    tag: firstParam(searchParams.tag),
    segment: firstParam(searchParams.segment),
  };
  const type = normalizeCustomerType(filters.type);
  const segment = normalizeSegment(filters.segment);
  const filterWhere: Prisma.CustomerWhereInput = {
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
  const scopeWhere: Prisma.CustomerWhereInput = user?.role === "SALESPERSON" ? { salesPersonId: user.id } : {};
  const where: Prisma.CustomerWhereInput = {
    AND: [filterWhere, scopeWhere].filter((item) => Object.keys(item).length > 0),
  };
  const [customers, salespeople] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        salesPerson: { select: { id: true, name: true } },
        tags: true,
        profile: { select: { tags: true } },
        leads: { select: { scene: true, metadata: true, notes: true, createdAt: true } },
        inquiries: { select: { scene: true, budget: true, content: true, notes: true, createdAt: true } },
        orders: {
          where: { parentId: null },
          select: { type: true, status: true, payableAmount: true, paidAmount: true, createdAt: true },
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

  const items = customers.map((customer) => {
      const completedOrders = customer.orders.filter((order) => order.status === "COMPLETED");
      const totalSpent = completedOrders.reduce((sum, order) => sum + Number(order.payableAmount), 0);
      const debt = customer.orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
      const lastOrder = [...customer.orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const segmentation = evaluateCustomerSegment(customer);
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
        segment: segmentation.segment,
        segmentReasons: segmentation.reasons,
        nextAction: segmentation.nextAction,
        groupBuyAmountText: formatCurrency(segmentation.metrics.groupBuyAmount),
        sceneStats: {
          groupBuyCount: segmentation.metrics.groupBuyCount,
          restockCount: segmentation.metrics.restockCount,
          banquetCount: segmentation.metrics.banquetCount,
        },
      };
    });
  const segmentCounts = items.reduce(
    (counts, item) => {
      counts[item.segment] += 1;
      return counts;
    },
    {
      HIGH_VALUE_GROUP_BUY: 0,
      RESTAURANT: 0,
      TOBACCO_WINE_STORE: 0,
      BANQUET: 0,
      REGULAR: 0,
    } satisfies Record<CustomerSegment, number>,
  );

  return {
    filters,
    salespeople,
    summary: {
      total: items.length,
      ...segmentCounts,
    },
    items: segment ? items.filter((item) => item.segment === segment) : items,
  };
}

export async function getCustomerDetail(id: string) {
  const user = await getSessionUser();
  const customer = await prisma.customer.findFirst({
    where: { id, ...(user?.role === "SALESPERSON" ? { salesPersonId: user.id } : {}) },
    include: {
      salesPerson: { select: { name: true, phone: true } },
      addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
      tags: true,
      profile: true,
      leads: { select: { scene: true, metadata: true, notes: true, createdAt: true } },
      inquiries: { select: { scene: true, budget: true, content: true, notes: true, createdAt: true } },
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
  const segmentation = evaluateCustomerSegment(customer);

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
      segment: segmentation.segment,
      segmentReasons: segmentation.reasons,
      nextAction: segmentation.nextAction,
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
