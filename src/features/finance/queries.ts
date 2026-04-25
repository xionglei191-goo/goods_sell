import type { OrderStatus, Prisma } from "@prisma/client";

import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

const receivableStatuses: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "REFUNDING"];
const receivableWhere: Prisma.OrderWhereInput = {
  parentId: null,
  status: { in: receivableStatuses },
};

type ReceivableOrder = {
  id: string;
  orderNo: string;
  payableAmount: unknown;
  paidAmount: unknown;
  createdAt: Date;
};

type ReceivableCustomer = {
  id: string;
  name: string;
  phone: string;
  orders: ReceivableOrder[];
};

function daysBetween(from: Date, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function bucketName(days: number) {
  if (days <= 30) return "30天内";
  if (days <= 60) return "30-60天";
  if (days <= 90) return "60-90天";
  return "90天以上";
}

function parseDate(value: string, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export async function getFinanceOverview() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trendStart = new Date(now);
  trendStart.setDate(now.getDate() - 29);
  trendStart.setHours(0, 0, 0, 0);

  const [orders, payments, purchases, profitOrders] = await Promise.all([
    prisma.order.findMany({
      where: receivableWhere,
      select: { payableAmount: true, paidAmount: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { type: "RECEIVE", status: "COMPLETED", paidAt: { gte: trendStart } },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["SUBMITTED", "RECEIVED", "COMPLETED"] } },
      select: { totalAmount: true },
    }),
    prisma.order.findMany({
      where: { parentId: null, status: { in: ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"] } },
      include: { items: { include: { product: { select: { costPrice: true } } } } },
    }),
  ]);

  const receivable = orders.reduce((sum, order) => sum + Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)), 0);
  const payable = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0);
  const monthIncome = payments.filter((payment) => payment.paidAt && payment.paidAt >= monthStart).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const profit = profitOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + (Number(item.unitPrice) - Number(item.product.costPrice)) * item.quantity, 0),
    0,
  );
  const trend = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);
    const key = `${date.getMonth() + 1}/${date.getDate()}`;
    return { label: key, income: 0 };
  });
  const trendMap = new Map(trend.map((item) => [item.label, item]));
  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const key = `${payment.paidAt.getMonth() + 1}/${payment.paidAt.getDate()}`;
    const bucket = trendMap.get(key);
    if (bucket) bucket.income += Number(payment.amount);
  }

  return {
    summary: { receivable, payable, monthIncome, profit },
    trend,
  };
}

export async function getReceivableData() {
  const customers = (await prisma.customer.findMany({
    include: {
      orders: {
        where: receivableWhere,
        orderBy: { createdAt: "asc" },
        select: { id: true, orderNo: true, payableAmount: true, paidAmount: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })) as ReceivableCustomer[];
  const aging = [
    { bucket: "30天内", amount: 0 },
    { bucket: "30-60天", amount: 0 },
    { bucket: "60-90天", amount: 0 },
    { bucket: "90天以上", amount: 0 },
  ];
  const agingMap = new Map(aging.map((item) => [item.bucket, item]));
  const rows = customers
    .map((customer) => {
      const unpaidOrders = customer.orders
        .map((order) => ({
          ...order,
          unpaid: Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)),
          age: daysBetween(order.createdAt),
        }))
        .filter((order) => order.unpaid > 0);
      for (const order of unpaidOrders) {
        const bucket = agingMap.get(bucketName(order.age));
        if (bucket) bucket.amount += order.unpaid;
      }
      return {
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        totalDebt: unpaidOrders.reduce((sum, order) => sum + order.unpaid, 0),
        earliestAge: unpaidOrders.length > 0 ? Math.max(...unpaidOrders.map((order) => order.age)) : 0,
        orderCount: unpaidOrders.length,
      };
    })
    .filter((row) => row.totalDebt > 0)
    .sort((a, b) => b.totalDebt - a.totalDebt);

  return { rows, aging };
}

export async function getPaymentRegisterData(searchParams: SearchParams) {
  const selectedCustomerId = firstParam(searchParams.customerId);
  const customers = await prisma.customer.findMany({
    where: { orders: { some: receivableWhere } },
    select: { id: true, name: true, phone: true },
    orderBy: { createdAt: "desc" },
  });
  const customerId = selectedCustomerId || customers[0]?.id || "";
  const orders = customerId
    ? await prisma.order.findMany({
        where: { ...receivableWhere, customerId },
        orderBy: { createdAt: "asc" },
        select: { id: true, orderNo: true, payableAmount: true, paidAmount: true, createdAt: true },
      })
    : [];

  return {
    customerId,
    customers,
    orders: orders
      .map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        payableAmount: Number(order.payableAmount),
        paidAmount: Number(order.paidAmount),
        remaining: Math.max(0, Number(order.payableAmount) - Number(order.paidAmount)),
        createdAt: order.createdAt.toISOString(),
        overdue: daysBetween(order.createdAt) > 30,
      }))
      .filter((order) => order.remaining > 0),
  };
}

export async function getStatementData(searchParams: SearchParams) {
  const customers = await prisma.customer.findMany({ select: { id: true, name: true, phone: true }, orderBy: { createdAt: "desc" } });
  const customerId = firstParam(searchParams.customerId) || customers[0]?.id || "";
  const now = new Date();
  const startDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = parseDate(firstParam(searchParams.startDate), startDefault);
  const endDate = parseDate(firstParam(searchParams.endDate), now);
  endDate.setHours(23, 59, 59, 999);
  const customer = customers.find((item) => item.id === customerId) ?? null;

  if (!customerId) {
    return { customers, customer, startDate, endDate, opening: 0, orderAmount: 0, paymentAmount: 0, ending: 0, rows: [] };
  }

  const [beforeOrders, beforePayments, periodOrders, periodPayments] = await Promise.all([
    prisma.order.findMany({ where: { ...receivableWhere, customerId, createdAt: { lt: startDate } }, select: { payableAmount: true } }),
    prisma.payment.findMany({ where: { customerId, type: "RECEIVE", status: "COMPLETED", paidAt: { lt: startDate } }, select: { amount: true } }),
    prisma.order.findMany({ where: { ...receivableWhere, customerId, createdAt: { gte: startDate, lte: endDate } }, select: { id: true, orderNo: true, payableAmount: true, createdAt: true } }),
    prisma.payment.findMany({ where: { customerId, type: "RECEIVE", status: "COMPLETED", paidAt: { gte: startDate, lte: endDate } }, select: { id: true, orderId: true, amount: true, paidAt: true } }),
  ]);
  const opening = beforeOrders.reduce((sum, order) => sum + Number(order.payableAmount), 0) - beforePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const orderRows = periodOrders.map((order) => ({
    id: order.id,
    date: order.createdAt.toISOString(),
    type: "订单",
    no: order.orderNo,
    debit: Number(order.payableAmount),
    credit: 0,
  }));
  const paymentRows = periodPayments.map((payment) => ({
    id: payment.id,
    date: (payment.paidAt ?? new Date()).toISOString(),
    type: "收款",
    no: payment.orderId ?? "多订单",
    debit: 0,
    credit: Number(payment.amount),
  }));
  const rows = [...orderRows, ...paymentRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const orderAmount = orderRows.reduce((sum, row) => sum + row.debit, 0);
  const paymentAmount = paymentRows.reduce((sum, row) => sum + row.credit, 0);

  return {
    customers,
    customer,
    startDate,
    endDate,
    opening,
    orderAmount,
    paymentAmount,
    ending: opening + orderAmount - paymentAmount,
    rows,
  };
}
