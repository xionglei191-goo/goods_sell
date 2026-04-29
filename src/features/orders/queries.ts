import { notFound } from "next/navigation";
import type { OrderStatus, OrderType, Prisma } from "@prisma/client";

import { getSessionUser } from "@/features/auth/guards";
import type { ManualOrderOptions, OrderDetailData, OrderListData } from "@/features/orders/types";
import {
  firstParam,
  getPaymentLabel,
  parseAmount,
  parseDate,
} from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

function normalizeStatus(value: string): OrderStatus | undefined {
  const statuses: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDING", "REFUNDED"];
  return statuses.includes(value as OrderStatus) ? (value as OrderStatus) : undefined;
}

function normalizeType(value: string): OrderType | undefined {
  const types: OrderType[] = ["RETAIL", "WHOLESALE", "GROUP_BUY"];
  return types.includes(value as OrderType) ? (value as OrderType) : undefined;
}

export async function getOrderList(searchParams: SearchParams): Promise<OrderListData> {
  const user = await getSessionUser();
  const filters = {
    status: firstParam(searchParams.status),
    type: firstParam(searchParams.type),
    customer: firstParam(searchParams.customer),
    startDate: firstParam(searchParams.startDate),
    endDate: firstParam(searchParams.endDate),
    minAmount: firstParam(searchParams.minAmount),
    maxAmount: firstParam(searchParams.maxAmount),
  };
  const status = normalizeStatus(filters.status);
  const type = normalizeType(filters.type);
  const startDate = parseDate(filters.startDate);
  const endDate = parseDate(filters.endDate, true);
  const minAmount = parseAmount(filters.minAmount);
  const maxAmount = parseAmount(filters.maxAmount);
  const filterWhere: Prisma.OrderWhereInput = {
    parentId: null,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(filters.customer
      ? {
          customer: {
            OR: [
              { name: { contains: filters.customer, mode: "insensitive" } },
              { phone: { contains: filters.customer, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(startDate || endDate ? { createdAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}),
    ...(minAmount !== undefined || maxAmount !== undefined
      ? {
          payableAmount: {
            ...(minAmount !== undefined ? { gte: minAmount } : {}),
            ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
          },
        }
      : {}),
  };
  const scopeWhere: Prisma.OrderWhereInput =
    user?.role === "SALESPERSON" ? { OR: [{ salesPersonId: user.id }, { customer: { salesPersonId: user.id } }] } : {};
  const where: Prisma.OrderWhereInput = {
    AND: [filterWhere, scopeWhere].filter((item) => Object.keys(item).length > 0),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    total,
    filters,
    items: orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      type: order.type,
      status: order.status,
      routingType: order.routingType,
      payableAmount: Number(order.payableAmount),
      paidAmount: Number(order.paidAmount),
      paymentLabel: getPaymentLabel(Number(order.payableAmount), Number(order.paidAmount)),
      createdAt: order.createdAt.toISOString(),
    })),
  };
}

export async function getOrderDetail(id: string): Promise<OrderDetailData> {
  const user = await getSessionUser();
  const scopeWhere: Prisma.OrderWhereInput =
    user?.role === "SALESPERSON" ? { OR: [{ salesPersonId: user.id }, { customer: { salesPersonId: user.id } }] } : {};
  const order = await prisma.order.findFirst({
    where: { id, ...scopeWhere },
    include: {
      customer: { select: { id: true, name: true, phone: true, type: true } },
      address: true,
      items: { orderBy: { createdAt: "asc" } },
      routings: {
        include: { dealer: { include: { customer: { select: { name: true } } } } },
        orderBy: { assignedAt: "asc" },
      },
      payments: { orderBy: { createdAt: "asc" } },
      delivery: true,
    },
  });

  if (!order) {
    notFound();
  }

  const timeline = [
    { label: "订单创建", at: order.createdAt.toISOString() },
    ...(Number(order.paidAmount) > 0 ? [{ label: "收款登记", at: order.updatedAt.toISOString() }] : []),
    ...(order.status === "CONFIRMED" || order.status === "SHIPPING" || order.status === "DELIVERED" || order.status === "COMPLETED"
      ? [{ label: "订单确认", at: order.updatedAt.toISOString() }]
      : []),
    ...(order.delivery?.shippedAt ? [{ label: "已发货", at: order.delivery.shippedAt.toISOString() }] : []),
    ...(order.delivery?.deliveredAt ? [{ label: "已送达", at: order.delivery.deliveredAt.toISOString() }] : []),
    ...(order.status === "COMPLETED" ? [{ label: "订单完成", at: order.updatedAt.toISOString() }] : []),
    ...(order.status === "CANCELLED" ? [{ label: "订单取消", at: order.updatedAt.toISOString() }] : []),
  ];

  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    type: order.type,
    routingType: order.routingType,
    totalAmount: Number(order.totalAmount),
    discountAmount: Number(order.discountAmount),
    payableAmount: Number(order.payableAmount),
    paidAmount: Number(order.paidAmount),
    payMethod: order.payMethod,
    remark: order.remark,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customer: {
      id: order.customer.id,
      name: order.customer.name,
      phone: order.customer.phone,
      type: order.customer.type,
    },
    address: {
      name: order.address.name,
      phone: order.address.phone,
      province: order.address.province,
      city: order.address.city,
      district: order.address.district,
      detail: order.address.detail,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      totalAmount: Number(item.totalAmount),
    })),
    routings: order.routings.map((routing) => ({
      id: routing.id,
      dealerName: routing.dealer.shopName || routing.dealer.customer.name,
      distance: Number(routing.distance),
      status: routing.status,
      reason: routing.reason,
      assignedAt: routing.assignedAt.toISOString(),
      respondedAt: routing.respondedAt?.toISOString() ?? null,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      type: payment.type,
      amount: Number(payment.amount),
      method: payment.method,
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? null,
      dueDate: payment.dueDate?.toISOString() ?? null,
    })),
    delivery: order.delivery
      ? {
          method: order.delivery.method,
          trackingNo: order.delivery.trackingNo,
          status: order.delivery.status,
          shippedAt: order.delivery.shippedAt?.toISOString() ?? null,
          deliveredAt: order.delivery.deliveredAt?.toISOString() ?? null,
        }
      : null,
    timeline,
  };
}

export async function getManualOrderOptions(): Promise<ManualOrderOptions> {
  const user = await getSessionUser();
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: { isVerified: true, ...(user?.role === "SALESPERSON" ? { salesPersonId: user.id } : {}) },
      include: {
        addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        retailPrice: true,
        wholesalePrice: true,
        unit: true,
        spec: true,
      },
    }),
  ]);

  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      addresses: customer.addresses.map((address) => ({
        id: address.id,
        label: `${address.name} ${address.phone} · ${address.province}${address.city}${address.district}${address.detail}`,
        isDefault: address.isDefault,
      })),
    })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock: product.stock,
      retailPrice: Number(product.retailPrice),
      wholesalePrice: Number(product.wholesalePrice),
      unit: product.unit,
      spec: product.spec,
    })),
  };
}
