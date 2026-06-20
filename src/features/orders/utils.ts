import type { OrderStatus, OrderType, PayMethod, RoutingStatus, RoutingType } from "@prisma/client";

export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  CONFIRMED: "已确认",
  SHIPPING: "配送中",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

export const orderStatusClasses: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-700",
  PAID: "bg-orange-50 text-orange-700",
  CONFIRMED: "bg-orange-50 text-orange-700",
  SHIPPING: "bg-orange-50 text-orange-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  REFUNDING: "bg-red-50 text-red-700",
  REFUNDED: "bg-red-50 text-red-700",
};

export const orderTypeLabels: Record<OrderType, string> = {
  RETAIL: "零售",
  WHOLESALE: "批发",
  GROUP_BUY: "团购",
};

export const routingTypeLabels: Record<RoutingType, string> = {
  DEALER: "经销商",
  WAREHOUSE: "总仓",
};

export const routingStatusLabels: Record<RoutingStatus, string> = {
  PENDING: "待接单",
  ACCEPTED: "已接单",
  REJECTED: "已拒单",
  EXPIRED: "已过期",
};

export const payMethodLabels: Record<PayMethod, string> = {
  WECHAT: "微信",
  CASH: "现金",
  TRANSFER: "转账",
  CREDIT: "赊账",
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toMoney(value: number) {
  return value.toFixed(2);
}

export function getPaymentLabel(payableAmount: number, paidAmount: number) {
  if (paidAmount <= 0) return "未支付";
  if (paidAmount >= payableAmount) return "已支付";
  return "部分支付";
}

export function getPaymentClass(payableAmount: number, paidAmount: number) {
  if (paidAmount <= 0) return "bg-red-50 text-red-700";
  if (paidAmount >= payableAmount) return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

export function buildOrderNoSequence(count: number, date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `HQ${yyyy}${mm}${dd}${String(count + 1).padStart(6, "0")}`;
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export function parseAmount(value: string | string[] | undefined) {
  const raw = firstParam(value).trim();
  if (raw === "") return undefined;
  const next = Number(raw);
  return Number.isFinite(next) && next >= 0 ? next : undefined;
}

export function parseDate(value: string | string[] | undefined, endOfDay = false) {
  const raw = firstParam(value).trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}
