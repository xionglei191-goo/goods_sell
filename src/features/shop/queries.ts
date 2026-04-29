import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { OrderStatus } from "@prisma/client";

import { auth } from "@/auth";
import { demoProducts } from "@/features/products/demo-data";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import type {
  AccountOverview,
  AddressView,
  CartItemView,
  CatalogData,
  CatalogFilters,
  CheckoutCouponView,
  CheckoutData,
  OrderCard,
  OrderDetail,
  ProductDetailData,
  ShopCategorySlug,
  ShopHomeData,
  ShopProduct,
  ShopUser,
} from "@/features/shop/types";
import {
  calculateCouponDiscount,
  categorySlugs,
  firstParam,
  formatCurrency,
  makeLoginRedirect,
  normalizeCategorySlug,
  orderStatusLabels,
  parseNumberParam,
  shopCategoryLabels,
  shopCategoryNames,
  splitParam,
} from "@/features/shop/utils";
import { prisma } from "@/lib/prisma";

type SearchValue = string | string[] | undefined;

type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  parent?: CategoryNode | null;
};

type RawShopProduct = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  brandId: string;
  unit: string;
  spec: string | null;
  retailPrice: unknown;
  wholesalePrice?: unknown;
  memberPrice?: unknown;
  stock: number;
  salesCount: number;
  bulkThreshold: number;
  description: string | null;
  createdAt: Date;
  brand: { id: string; name: string };
  category: CategoryNode;
  images: Array<{ id: string; url: string; alt: string | null }>;
};

const productInclude = {
  brand: { select: { id: true, name: true } },
  category: {
    select: {
      id: true,
      name: true,
      parentId: true,
      parent: {
        select: {
          id: true,
          name: true,
          parentId: true,
          parent: {
            select: {
              id: true,
              name: true,
              parentId: true,
            },
          },
        },
      },
    },
  },
  images: {
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
    select: { id: true, url: true, alt: true },
  },
};

function getRootCategory(category: CategoryNode): CategoryNode {
  let current = category;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

function mapProduct(product: RawShopProduct): ShopProduct {
  const root = getRootCategory(product.category);

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    rootCategoryName: root.name,
    brandId: product.brandId,
    brandName: product.brand.name,
    unit: product.unit,
    spec: product.spec,
    imageUrl: product.images[0]?.url ?? null,
    description: product.description,
    retailPrice: Number(product.retailPrice),
    stock: product.stock,
    salesCount: product.salesCount,
    bulkThreshold: product.bulkThreshold,
    createdAt: product.createdAt.toISOString(),
  };
}

function fallbackProducts(): ShopProduct[] {
  return demoProducts.map((product, index) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category,
    rootCategoryName: product.category.includes("饮料") || product.category.includes("碳酸") ? "饮料" : product.category.includes("食品") ? "食品" : "酒类",
    brandId: product.brandId,
    brandName: product.brand,
    unit: "件",
    spec: null,
    imageUrl: product.imageUrl,
    description: "演示商品数据。连接数据库后将展示完整商城商品。",
    retailPrice: product.retailPrice,
    stock: product.stock,
    salesCount: Math.max(1, 120 - index * 12),
    bulkThreshold: product.bulkThreshold,
    createdAt: new Date(Date.now() - index * 86400000).toISOString(),
  }));
}

const getCachedActiveProducts = unstable_cache(
  async () => {
    const products = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: productInclude,
      orderBy: [{ createdAt: "desc" }],
    });

    return products.map((product) => mapProduct(product as RawShopProduct));
  },
  ["shop-active-products"],
  { revalidate: 60, tags: [SHOP_PRODUCTS_CACHE_TAG] },
);

export async function getActiveProducts() {
  try {
    return await getCachedActiveProducts();
  } catch {
    return fallbackProducts();
  }
}

function buildCategoryTabs(products: ShopProduct[]) {
  return categorySlugs.map((slug) => {
    const label = shopCategoryLabels[slug];
    const count = slug === "all" ? products.length : products.filter((product) => product.rootCategoryName === label).length;
    return { slug, label, count };
  });
}

function matchesCategory(product: ShopProduct, slug: ShopCategorySlug) {
  if (slug === "all") {
    return true;
  }

  return product.rootCategoryName === shopCategoryNames[slug];
}

function parseCatalogFilters(searchParams: Record<string, SearchValue>): CatalogFilters {
  const sort = firstParam(searchParams.sort);
  return {
    category: normalizeCategorySlug(searchParams.category),
    q: firstParam(searchParams.q).trim(),
    brandIds: splitParam(searchParams.brand),
    minPrice: parseNumberParam(searchParams.minPrice),
    maxPrice: parseNumberParam(searchParams.maxPrice),
    sort: sort === "price-asc" || sort === "price-desc" || sort === "sales" || sort === "new" ? sort : "default",
  };
}

function filterProducts(products: ShopProduct[], filters: CatalogFilters) {
  const keyword = filters.q.toLowerCase();
  const filtered = products.filter((product) => {
    const matchesKeyword = keyword
      ? product.name.toLowerCase().includes(keyword) || product.sku.toLowerCase().includes(keyword) || product.brandName.toLowerCase().includes(keyword)
      : true;
    const matchesBrand = filters.brandIds.length > 0 ? filters.brandIds.includes(product.brandId) : true;
    const matchesPrice = (filters.minPrice === undefined || product.retailPrice >= filters.minPrice) && (filters.maxPrice === undefined || product.retailPrice <= filters.maxPrice);
    return matchesCategory(product, filters.category) && matchesKeyword && matchesBrand && matchesPrice;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "price-asc") return a.retailPrice - b.retailPrice;
    if (filters.sort === "price-desc") return b.retailPrice - a.retailPrice;
    if (filters.sort === "sales") return b.salesCount - a.salesCount;
    if (filters.sort === "new") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return b.salesCount - a.salesCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getProfileLabels(tags: unknown) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    return [];
  }

  const labels = (tags as { labels?: unknown }).labels;
  return jsonStringArray(labels);
}

function buildRecommendedProducts(products: ShopProduct[], preferredCategories: string[]) {
  if (preferredCategories.length === 0) {
    return [...products].sort((a, b) => b.salesCount - a.salesCount).slice(0, 8);
  }

  const preferred = products
    .filter((product) => preferredCategories.includes(product.rootCategoryName))
    .sort((a, b) => b.salesCount - a.salesCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const fallback = products
    .filter((product) => !preferred.some((item) => item.id === product.id))
    .sort((a, b) => b.salesCount - a.salesCount);

  return [...preferred, ...fallback].slice(0, 8);
}

export async function getShopLayoutData(): Promise<{ user: ShopUser | null; cartCount: number }> {
  const session = await auth();
  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        phone: session.user.phone,
        role: session.user.role,
        image: session.user.image ?? null,
      }
    : null;

  if (!session?.user.id || session.user.role !== "CONSUMER") {
    return { user, cartCount: 0 };
  }

  try {
    const result = await prisma.cartItem.aggregate({
      where: { customerId: session.user.id },
      _sum: { quantity: true },
    });
    return { user, cartCount: result._sum.quantity ?? 0 };
  } catch {
    return { user, cartCount: 0 };
  }
}

export async function getShopHomeData(): Promise<ShopHomeData> {
  const products = await getActiveProducts();
  const session = await auth();
  let preferredCategories: string[] = [];
  let recommendationReason = "结合热销商品为你推荐";

  if (session?.user.id && session.user.role === "CONSUMER") {
    const profile = await prisma.userProfile.findUnique({
      where: { customerId: session.user.id },
      select: { preferredCategories: true, tags: true },
    });

    preferredCategories = jsonStringArray(profile?.preferredCategories);
    const labels = getProfileLabels(profile?.tags);
    const personality = labels.find((label) => label.startsWith("性格:"));
    const preference = labels.find((label) => label.startsWith("偏好:") || label.startsWith("互动偏好:"));
    recommendationReason = preference ? `基于你的${preference.replace(":", " ")}` : personality ? `基于你的${personality.replace(":", " ")}` : recommendationReason;
  }

  return {
    banners: [
      {
        id: "local-delivery",
        title: "湘潭本地好货，当日配送",
        subtitle: "酒水、食品、饮料一站式采买",
        href: "/shop/catalog?sort=sales",
        tone: "red",
      },
      {
        id: "wine",
        title: "宴席酒水精选",
        subtitle: "热门白酒、啤酒、红酒稳定供应",
        href: "/shop/catalog?category=wine",
        tone: "amber",
      },
      {
        id: "drink",
        title: "整箱饮料更划算",
        subtitle: "家庭囤货、门店补货都方便",
        href: "/shop/catalog?category=drink",
        tone: "green",
      },
    ],
    categories: buildCategoryTabs(products).filter((category) => category.slug !== "all"),
    hotProducts: [...products].sort((a, b) => b.salesCount - a.salesCount).slice(0, 8),
    newProducts: [...products].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
    recommendedProducts: buildRecommendedProducts(products, preferredCategories),
    recommendationReason,
  };
}

export async function getCatalogData(searchParams: Record<string, SearchValue>): Promise<CatalogData> {
  const filters = parseCatalogFilters(searchParams);
  const products = await getActiveProducts();
  const categoryProducts = products.filter((product) => matchesCategory(product, filters.category));
  const brandCounts = new Map<string, { id: string; name: string; count: number }>();

  for (const product of categoryProducts) {
    const current = brandCounts.get(product.brandId);
    brandCounts.set(product.brandId, {
      id: product.brandId,
      name: product.brandName,
      count: (current?.count ?? 0) + 1,
    });
  }

  const prices = products.map((product) => product.retailPrice);

  return {
    filters,
    categories: buildCategoryTabs(products),
    brands: Array.from(brandCounts.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    products: filterProducts(products, filters),
    priceBounds: {
      min: Math.floor(Math.min(...prices, 0)),
      max: Math.ceil(Math.max(...prices, 0)),
    },
  };
}

export async function getProductDetailData(id: string): Promise<ProductDetailData> {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product || product.status !== "ACTIVE") {
      notFound();
    }

    const mapped = mapProduct(product as RawShopProduct);
    const related = await prisma.product.findMany({
      where: {
        status: "ACTIVE",
        categoryId: product.categoryId,
        id: { not: product.id },
      },
      include: productInclude,
      orderBy: [{ salesCount: "desc" }],
      take: 4,
    });

    return {
      product: {
        ...mapped,
        wholesalePrice: Number(product.wholesalePrice),
        memberPrice: product.memberPrice ? Number(product.memberPrice) : null,
        images: product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt })),
      },
      relatedProducts: related.map((item) => mapProduct(item as RawShopProduct)),
    };
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_NOT_FOUND")) {
      throw error;
    }

    const fallback = fallbackProducts()[0];
    return {
      product: {
        ...fallback,
        wholesalePrice: fallback.retailPrice * 0.82,
        memberPrice: fallback.retailPrice * 0.92,
        images: fallback.imageUrl ? [{ id: "fallback", url: fallback.imageUrl, alt: fallback.name }] : [],
      },
      relatedProducts: fallbackProducts().filter((product) => product.id !== fallback.id).slice(0, 4),
    };
  }
}

function mapCartItem(item: {
  id: string;
  quantity: number;
  selected: boolean;
  product: RawShopProduct;
}): CartItemView {
  const product = mapProduct(item.product);
  const quantity = Math.min(item.quantity, product.stock);
  return {
    id: item.id,
    productId: product.id,
    name: product.name,
    sku: product.sku,
    brandName: product.brandName,
    spec: product.spec,
    unit: product.unit,
    imageUrl: product.imageUrl,
    price: product.retailPrice,
    quantity: item.quantity,
    stock: product.stock,
    bulkThreshold: product.bulkThreshold,
    selected: item.selected,
    subtotal: product.retailPrice * quantity,
    isAvailable: product.stock > 0 && item.quantity <= product.stock,
  };
}

function configNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function getConsumerId(callbackUrl: string) {
  const session = await auth();
  if (session?.user.id && session.user.role === "CONSUMER") {
    return session.user.id;
  }

  redirect(makeLoginRedirect(callbackUrl));
}

export async function getCartItems(): Promise<CartItemView[]> {
  const customerId = await getConsumerId("/shop/cart");
  const items = await prisma.cartItem.findMany({
    where: { customerId },
    include: { product: { include: productInclude } },
    orderBy: { updatedAt: "desc" },
  });

  return items.map((item) => mapCartItem(item as unknown as { id: string; quantity: number; selected: boolean; product: RawShopProduct }));
}

function mapAddress(address: {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}): AddressView {
  return {
    id: address.id,
    name: address.name,
    phone: address.phone,
    province: address.province,
    city: address.city,
    district: address.district,
    detail: address.detail,
    isDefault: address.isDefault,
  };
}

export async function getCheckoutData(cartItemIds: string[]): Promise<CheckoutData> {
  const customerId = await getConsumerId("/shop/checkout");
  const items = await prisma.cartItem.findMany({
    where: {
      customerId,
      ...(cartItemIds.length > 0 ? { id: { in: cartItemIds } } : { selected: true }),
    },
    include: { product: { include: productInclude } },
    orderBy: { updatedAt: "desc" },
  });
  const addresses = await prisma.address.findMany({
    where: { customerId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  const mappedItems = items.map((item) => mapCartItem(item as unknown as { id: string; quantity: number; selected: boolean; product: RawShopProduct }));
  const totalAmount = mappedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const bulkOrderConfig = await prisma.systemConfig.findUnique({
    where: { key: "bulkOrderAmount" },
    select: { value: true },
  });
  const bulkOrderAmount = configNumberValue(bulkOrderConfig?.value, 500);
  const coupons = await prisma.customerCoupon.findMany({
    where: { customerId, status: "UNUSED" },
    include: { coupon: true },
    orderBy: { receivedAt: "desc" },
  });
  const now = new Date();
  const couponViews: CheckoutCouponView[] = coupons.map((item) => {
    const threshold = Number(item.coupon.threshold);
    const discountAmount = calculateCouponDiscount(totalAmount, {
      type: item.coupon.type,
      amount: item.coupon.amount ? Number(item.coupon.amount) : null,
      percent: item.coupon.percent ? Number(item.coupon.percent) : null,
      threshold,
    });
    const isStarted = item.coupon.startsAt <= now;
    const isExpired = item.coupon.endsAt < now;
    const isUsable = item.coupon.isActive && isStarted && !isExpired && totalAmount >= threshold && discountAmount > 0;
    const reason = !item.coupon.isActive
      ? "已停用"
      : !isStarted
        ? "未开始"
        : isExpired
          ? "已过期"
          : totalAmount < threshold
            ? `满 ${formatCurrency(threshold)} 可用`
            : isUsable
              ? `可优惠 ${formatCurrency(discountAmount)}`
              : "暂不可用";

    return {
      id: item.id,
      name: item.coupon.name,
      type: item.coupon.type,
      amount: item.coupon.amount ? Number(item.coupon.amount) : null,
      percent: item.coupon.percent ? Number(item.coupon.percent) : null,
      threshold,
      discountAmount,
      status: item.status,
      startsAt: item.coupon.startsAt.toISOString(),
      endsAt: item.coupon.endsAt.toISOString(),
      isUsable,
      reason,
    };
  });

  return {
    items: mappedItems,
    addresses: addresses.map(mapAddress),
    defaultAddressId: addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id ?? null,
    coupons: couponViews,
    totalAmount,
    bulkOrderAmount,
  };
}

export async function getAddresses(): Promise<AddressView[]> {
  const customerId = await getConsumerId("/shop/account/addresses");
  const addresses = await prisma.address.findMany({
    where: { customerId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return addresses.map(mapAddress);
}

export async function getAccountOverview(): Promise<AccountOverview> {
  const customerId = await getConsumerId("/shop/account");
  const [customer, orders, pending, completed, addresses] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, points: true, avatar: true },
    }),
    prisma.order.count({ where: { customerId } }),
    prisma.order.count({ where: { customerId, status: { in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "SHIPPING"] } } }),
    prisma.order.count({ where: { customerId, status: "COMPLETED" } }),
    prisma.address.count({ where: { customerId } }),
  ]);

  return {
    customer,
    stats: { orders, pending, completed, addresses },
  };
}

function mapOrderCard(order: {
  id: string;
  orderNo: string;
  status: keyof typeof orderStatusLabels;
  payableAmount: unknown;
  paidAmount: unknown;
  createdAt: Date;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    product: { images: Array<{ url: string }> };
  }>;
}): OrderCard {
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    statusLabel: orderStatusLabels[order.status],
    payableAmount: Number(order.payableAmount),
    paidAmount: Number(order.paidAmount),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productName,
      quantity: item.quantity,
      imageUrl: item.product.images[0]?.url ?? null,
    })),
  };
}

export async function getOrders(status?: string): Promise<OrderCard[]> {
  const customerId = await getConsumerId("/shop/my-orders");
  const statusWhere: { in?: OrderStatus[]; equals?: OrderStatus } | undefined =
    status === "pay"
      ? { equals: "PENDING_PAYMENT" }
      : status === "ship"
        ? { in: ["PAID", "CONFIRMED"] }
        : status === "pending"
          ? { in: ["PENDING_PAYMENT", "PAID", "CONFIRMED"] }
          : status === "delivery"
            ? { in: ["SHIPPING", "DELIVERED"] }
            : status === "completed"
              ? { equals: "COMPLETED" }
              : status === "cancelled"
                ? { equals: "CANCELLED" }
                : undefined;
  const orders = await prisma.order.findMany({
    where: {
      customerId,
      ...(statusWhere ? { status: statusWhere } : {}),
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
        },
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((order) => mapOrderCard(order as unknown as Parameters<typeof mapOrderCard>[0]));
}

export async function getOrderDetail(id: string): Promise<OrderDetail> {
  const customerId = await getConsumerId(`/shop/my-orders/${id}`);
  const order = await prisma.order.findFirst({
    where: { id, customerId },
    include: {
      address: true,
      items: {
        include: {
          product: {
            include: {
              images: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const card = mapOrderCard(order);
  return {
    ...card,
    totalAmount: Number(order.totalAmount),
    discountAmount: Number(order.discountAmount),
    payMethod: order.payMethod,
    remark: order.remark,
    address: mapAddress(order.address),
    timeline: [
      { label: "订单创建", at: order.createdAt.toISOString() },
      ...(order.paidAmount.gt(0) ? [{ label: "模拟支付成功", at: order.updatedAt.toISOString() }] : []),
      ...(order.status === "COMPLETED" ? [{ label: "订单完成", at: order.updatedAt.toISOString() }] : []),
    ],
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.productName,
      sku: item.sku,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      totalAmount: Number(item.totalAmount),
      imageUrl: item.product.images[0]?.url ?? null,
    })),
  };
}

export async function getProfileData() {
  const customerId = await getConsumerId("/shop/account/profile");
  return prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { id: true, name: true, phone: true, avatar: true },
  });
}
