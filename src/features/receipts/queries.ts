import type { PaymentType } from "@prisma/client";

import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizePaymentType(value: string): PaymentType | undefined {
  return value === "RECEIVE" || value === "PAY" ? value : undefined;
}

export async function getReceiptsData(searchParams: SearchParams) {
  const filters = {
    paymentType: firstParam(searchParams.paymentType),
    q: firstParam(searchParams.q),
  };
  const paymentType = normalizePaymentType(filters.paymentType);

  const [payments, invoices, invoiceableOrders] = await Promise.all([
    prisma.payment.findMany({
      where: {
        ...(paymentType ? { type: paymentType } : {}),
        ...(filters.q
          ? {
              customer: {
                OR: [
                  { name: { contains: filters.q, mode: "insensitive" } },
                  { phone: { contains: filters.q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        customer: { select: { name: true, phone: true } },
        order: { select: { orderNo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.invoice.findMany({
      include: {
        customer: { select: { name: true, phone: true } },
        order: { select: { orderNo: true } },
        payment: { select: { id: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    }),
    prisma.order.findMany({
      where: {
        paidAmount: { gt: 0 },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
        invoices: { none: {} },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const receivePayments = payments.filter((payment) => payment.type === "RECEIVE" && payment.status === "COMPLETED");
  const payPayments = payments.filter((payment) => payment.type === "PAY" && payment.status === "COMPLETED");

  return {
    filters,
    summary: {
      receiveCount: receivePayments.length,
      receiveAmount: receivePayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      payCount: payPayments.length,
      payAmount: payPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      pendingInvoice: invoiceableOrders.length,
      issuedInvoice: invoices.filter((invoice) => invoice.status === "ISSUED").length,
    },
    payments: payments.map((payment) => ({
      id: payment.id,
      orderNo: payment.order?.orderNo ?? "多订单",
      customerName: payment.customer.name,
      customerPhone: payment.customer.phone,
      type: payment.type,
      amount: Number(payment.amount),
      method: payment.method,
      status: payment.status,
      transactionId: payment.transactionId,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      type: invoice.type,
      status: invoice.status,
      provider: invoice.provider,
      customerName: invoice.customer.name,
      orderNo: invoice.order?.orderNo ?? "-",
      buyerName: invoice.buyerName,
      amount: Number(invoice.amount),
      taxAmount: Number(invoice.taxAmount),
      issuedAt: invoice.issuedAt.toISOString(),
    })),
    invoiceableOrders: invoiceableOrders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      amount: Number(order.paidAmount),
    })),
  };
}
