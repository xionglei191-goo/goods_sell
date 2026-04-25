import type { OrderStatus, PayMethod } from "@prisma/client";

import type { ShopCategorySlug } from "@/features/shop/types";

export const shopCategoryNames: Record<Exclude<ShopCategorySlug, "all">, string> = {
  wine: "酒类",
  food: "食品",
  drink: "饮料",
};

export const shopCategoryLabels: Record<ShopCategorySlug, string> = {
  all: "全部",
  wine: "酒类",
  food: "食品",
  drink: "饮料",
};

export const categorySlugs: ShopCategorySlug[] = ["all", "wine", "food", "drink"];

export const categoryAccents: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  酒类: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-100", label: "酒" },
  食品: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100", label: "食" },
  饮料: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100", label: "饮" },
  default: { bg: "bg-stone-100", text: "text-stone-700", ring: "ring-stone-200", label: "华" },
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待支付",
  PAID: "待发货",
  CONFIRMED: "待发货",
  SHIPPING: "配送中",
  DELIVERED: "待收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

export const orderStatusClasses: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-700",
  PAID: "bg-red-50 text-red-700",
  CONFIRMED: "bg-red-50 text-red-700",
  SHIPPING: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-stone-100 text-stone-700",
  CANCELLED: "bg-slate-100 text-slate-500",
  REFUNDING: "bg-purple-50 text-purple-700",
  REFUNDED: "bg-slate-100 text-slate-500",
};

export const payMethodLabels: Record<PayMethod, string> = {
  WECHAT: "模拟微信支付",
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

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeCategorySlug(value?: string | string[] | null): ShopCategorySlug {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "wine" || raw === "food" || raw === "drink") {
    return raw;
  }

  return "all";
}

export function splitParam(value?: string | string[] | null) {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function firstParam(value?: string | string[] | null) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export function parseNumberParam(value?: string | string[] | null) {
  const raw = firstParam(value).trim();
  if (raw === "") return undefined;
  const next = Number(raw);
  return Number.isFinite(next) && next >= 0 ? next : undefined;
}

export function toMoney(value: number) {
  return value.toFixed(2);
}

export function calculateCouponDiscount(
  totalAmount: number,
  coupon: {
    type: "AMOUNT" | "PERCENT";
    amount?: number | null;
    percent?: number | null;
    threshold?: number | null;
  },
) {
  const threshold = coupon.threshold ?? 0;
  if (totalAmount < threshold) {
    return 0;
  }

  if (coupon.type === "AMOUNT") {
    return Math.min(totalAmount, Math.max(0, coupon.amount ?? 0));
  }

  const percent = Math.max(0, Math.min(10, coupon.percent ?? 10));
  return Math.min(totalAmount, Math.max(0, totalAmount * (10 - percent) * 0.1));
}

export function formatCouponBenefit(coupon: { type: "AMOUNT" | "PERCENT"; amount?: number | null; percent?: number | null }) {
  if (coupon.type === "AMOUNT") {
    return `减 ${formatCurrency(coupon.amount ?? 0)}`;
  }

  return `${coupon.percent ?? 10} 折`;
}

export function getCategoryAccent(rootCategoryName: string) {
  return categoryAccents[rootCategoryName] ?? categoryAccents.default;
}

export function getProductInitial(name: string) {
  return name.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").slice(0, 1) || "华";
}

export function calcCartTotal(items: Array<{ selected: boolean; price: number; quantity: number; isAvailable?: boolean }>) {
  return items
    .filter((item) => item.selected && item.isAvailable !== false)
    .reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function makeLoginRedirect(path: string) {
  return `/login?callbackUrl=${encodeURIComponent(path)}`;
}
