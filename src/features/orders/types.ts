import type { OrderStatus, OrderType, PayMethod, RoutingStatus, RoutingType } from "@prisma/client";

export type OrderListItem = {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  type: OrderType;
  status: OrderStatus;
  routingType: RoutingType;
  payableAmount: number;
  paidAmount: number;
  paymentLabel: string;
  createdAt: string;
};

export type OrderListFilters = {
  status: string;
  type: string;
  customer: string;
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
};

export type OrderListData = {
  items: OrderListItem[];
  total: number;
  filters: OrderListFilters;
};

export type OrderDetailData = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  type: OrderType;
  routingType: RoutingType;
  totalAmount: number;
  discountAmount: number;
  payableAmount: number;
  paidAmount: number;
  payMethod: PayMethod | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    type: string;
  };
  address: {
    name: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
  };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    unitPrice: number;
    quantity: number;
    totalAmount: number;
  }>;
  routings: Array<{
    id: string;
    dealerName: string;
    distance: number;
    status: RoutingStatus;
    reason: string | null;
    assignedAt: string;
    respondedAt: string | null;
  }>;
  payments: Array<{
    id: string;
    type: string;
    amount: number;
    method: PayMethod;
    status: string;
    paidAt: string | null;
    dueDate: string | null;
  }>;
  delivery: {
    method: string | null;
    trackingNo: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  timeline: Array<{
    label: string;
    at: string;
  }>;
};

export type ManualOrderOptions = {
  customers: Array<{
    id: string;
    name: string;
    phone: string;
    type: string;
    addresses: Array<{
      id: string;
      label: string;
      isDefault: boolean;
    }>;
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    stock: number;
    retailPrice: number;
    wholesalePrice: number;
    unit: string;
    spec: string | null;
  }>;
};

export type ActionResult<T = undefined> =
  | ({ success: true; message?: string } & (T extends undefined ? object : { data: T }))
  | { success: false; error: { code: string; message: string } };
