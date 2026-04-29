import type { CouponStatus, CouponType, OrderStatus, PayMethod } from "@prisma/client";

export type ShopCategorySlug = "all" | "wine" | "food" | "drink";

export type ShopUser = {
  id: string;
  name: string | null;
  phone: string;
  role: string;
  image?: string | null;
};

export type ShopCategoryTab = {
  slug: ShopCategorySlug;
  label: string;
  count: number;
};

export type ShopBrandFilter = {
  id: string;
  name: string;
  count: number;
};

export type ShopProduct = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  rootCategoryName: string;
  brandId: string;
  brandName: string;
  unit: string;
  spec: string | null;
  imageUrl: string | null;
  description: string | null;
  retailPrice: number;
  stock: number;
  salesCount: number;
  bulkThreshold: number;
  createdAt: string;
};

export type ShopHomeData = {
  banners: Array<{
    id: string;
    title: string;
    subtitle: string;
    href: string;
    tone: "red" | "amber" | "green";
  }>;
  categories: ShopCategoryTab[];
  hotProducts: ShopProduct[];
  newProducts: ShopProduct[];
  recommendedProducts: ShopProduct[];
  recommendationReason: string;
};

export type CatalogFilters = {
  category: ShopCategorySlug;
  q: string;
  brandIds: string[];
  minPrice?: number;
  maxPrice?: number;
  sort: "default" | "price-asc" | "price-desc" | "sales" | "new";
};

export type CatalogData = {
  filters: CatalogFilters;
  categories: ShopCategoryTab[];
  brands: ShopBrandFilter[];
  products: ShopProduct[];
  priceBounds: {
    min: number;
    max: number;
  };
};

export type ProductDetailData = {
  product: ShopProduct & {
    wholesalePrice: number;
    memberPrice: number | null;
    images: Array<{ id: string; url: string; alt: string | null }>;
  };
  relatedProducts: ShopProduct[];
};

export type CartItemView = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  brandName: string;
  spec: string | null;
  unit: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
  stock: number;
  bulkThreshold: number;
  selected: boolean;
  subtotal: number;
  isAvailable: boolean;
};

export type AddressView = {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
};

export type CheckoutData = {
  items: CartItemView[];
  addresses: AddressView[];
  defaultAddressId: string | null;
  coupons: CheckoutCouponView[];
  totalAmount: number;
  bulkOrderAmount: number;
};

export type CheckoutCouponView = {
  id: string;
  name: string;
  type: CouponType;
  amount: number | null;
  percent: number | null;
  threshold: number;
  discountAmount: number;
  status: CouponStatus;
  startsAt: string;
  endsAt: string;
  isUsable: boolean;
  reason: string;
};

export type AccountOverview = {
  customer: {
    id: string;
    name: string;
    phone: string;
    points: number;
    avatar: string | null;
  };
  stats: {
    orders: number;
    pending: number;
    completed: number;
    addresses: number;
  };
};

export type OrderCard = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  statusLabel: string;
  payableAmount: number;
  paidAmount: number;
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    imageUrl: string | null;
  }>;
};

export type OrderDetail = Omit<OrderCard, "items"> & {
  totalAmount: number;
  discountAmount: number;
  payMethod: PayMethod | null;
  remark: string | null;
  address: AddressView;
  timeline: Array<{
    label: string;
    at: string;
  }>;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    sku: string;
    unitPrice: number;
    quantity: number;
    totalAmount: number;
    imageUrl: string | null;
  }>;
};

export type ActionResult<T = undefined> =
  | ({ success: true; message?: string } & (T extends undefined ? object : { data: T }))
  | { success: false; error: { code: string; message: string; redirectTo?: string } };
