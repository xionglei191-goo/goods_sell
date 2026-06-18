"use server";

import type { LeadScene, Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";

import { auth } from "@/auth";
import { routeOrderById } from "@/features/orders/routing";
import { sendOrderStatusTemplate } from "@/features/wechat/official";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import {
  addToCartSchema,
  addressSchema,
  checkoutSchema,
  profileSchema,
  updateCartQuantitySchema,
  updateCartSelectedSchema,
  type AddressInput,
  type CheckoutInput,
  type ProfileInput,
} from "@/features/shop/schemas";
import type { ActionResult } from "@/features/shop/types";
import { calculateCouponDiscount, makeLoginRedirect, toMoney } from "@/features/shop/utils";
import { prisma } from "@/lib/prisma";

type CheckoutResult =
  | { kind: "ORDER"; orderNo: string; orderId: string }
  | { kind: "INQUIRY"; inquiryNo: string; inquiryId: string; leadId: string };

async function getCustomerId() {
  const session = await auth();
  if (session?.user.id && session.user.role === "CONSUMER") {
    return session.user.id;
  }

  return null;
}

function validationError(message: string): ActionResult {
  return { success: false, error: { code: "VALIDATION_ERROR", message } };
}

function authError(path: string): ActionResult {
  return {
    success: false,
    error: {
      code: "AUTH_REQUIRED",
      message: "请先登录后再操作",
      redirectTo: makeLoginRedirect(path),
    },
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function revalidateShopPaths() {
  revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
  revalidatePath("/shop");
  revalidatePath("/shop/catalog");
  revalidatePath("/shop/cart");
  revalidatePath("/shop/checkout");
  revalidatePath("/shop/my-orders");
  revalidatePath("/shop/coupons");
  revalidatePath("/dashboard/marketing");
  revalidatePath("/dashboard/marketing/coupons");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/inventory/records");
}

async function getStockOperatorId() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (!admin) {
    throw new Error("未找到库存操作员，请先创建管理员账号");
  }

  return admin.id;
}

function formatOrderDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function generateOrderNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  const seq = String(count + 1).padStart(6, "0");
  const orderNo = `HQ${formatOrderDate(now)}${seq}`;
  const existing = await tx.order.findUnique({ where: { orderNo }, select: { id: true } });
  if (existing) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `HQ${formatOrderDate(now)}${seq}${suffix}`;
  }
  return orderNo;
}

async function generateInquiryNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.inquiry.count({ where: { createdAt: { gte: start } } });
  return `XJ${formatOrderDate(now)}${String(count + 1).padStart(5, "0")}`;
}

function configNumberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function inferInquiryScene(mode: CheckoutInput["checkoutMode"]): LeadScene {
  if (mode === "BANQUET") return "BANQUET";
  if (mode === "RESTOCK") return "RESTOCK";
  return "GROUP_BUY";
}

export async function addToCart(input: { productId: string; quantity: number; replaceQuantity?: boolean }): Promise<ActionResult<{ cartCount: number; itemId: string }>> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError(`/shop/product/${input.productId}`) as ActionResult<{ cartCount: number; itemId: string }>;
  }

  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "加购信息不完整") as ActionResult<{ cartCount: number; itemId: string }>;
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { id: true, stock: true, status: true },
    });

    if (!product || product.status !== "ACTIVE") {
      return { success: false, error: { code: "PRODUCT_UNAVAILABLE", message: "商品已下架" } };
    }

    if (product.stock < parsed.data.quantity) {
      return { success: false, error: { code: "STOCK_NOT_ENOUGH", message: "库存不足，无法加入购物车" } };
    }

    const item = await prisma.cartItem.upsert({
      where: { customerId_productId: { customerId, productId: parsed.data.productId } },
      update: {
        quantity: parsed.data.replaceQuantity ? parsed.data.quantity : { increment: parsed.data.quantity },
        selected: true,
      },
      create: {
        customerId,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        selected: true,
      },
    });

    const result = await prisma.cartItem.aggregate({
      where: { customerId },
      _sum: { quantity: true },
    });
    revalidateShopPaths();
    return { success: true, message: "已加入购物车", data: { cartCount: result._sum.quantity ?? 0, itemId: item.id } };
  } catch (error) {
    return { success: false, error: { code: "ADD_TO_CART_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateCartItemQuantity(input: { itemId: string; quantity: number }): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/cart");
  }

  const parsed = updateCartQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "数量不正确");
  }

  try {
    const item = await prisma.cartItem.findFirst({
      where: { id: parsed.data.itemId, customerId },
      include: { product: { select: { stock: true } } },
    });

    if (!item) {
      return { success: false, error: { code: "CART_ITEM_NOT_FOUND", message: "购物车商品不存在" } };
    }

    if (parsed.data.quantity > item.product.stock) {
      return { success: false, error: { code: "STOCK_NOT_ENOUGH", message: "库存不足" } };
    }

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: parsed.data.quantity },
    });

    revalidateShopPaths();
    return { success: true, message: "数量已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_CART_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateCartItemSelected(input: { itemId: string; selected: boolean }): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/cart");
  }

  const parsed = updateCartSelectedSchema.safeParse(input);
  if (!parsed.success) {
    return validationError("选择状态不正确");
  }

  try {
    await prisma.cartItem.updateMany({
      where: { id: parsed.data.itemId, customerId },
      data: { selected: parsed.data.selected },
    });
    revalidateShopPaths();
    return { success: true };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_SELECTION_FAILED", message: getErrorMessage(error) } };
  }
}

export async function selectAllCartItems(selected: boolean): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/cart");
  }

  try {
    await prisma.cartItem.updateMany({
      where: { customerId },
      data: { selected },
    });
    revalidateShopPaths();
    return { success: true };
  } catch (error) {
    return { success: false, error: { code: "SELECT_ALL_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteCartItem(itemId: string): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/cart");
  }

  try {
    await prisma.cartItem.deleteMany({ where: { id: itemId, customerId } });
    revalidateShopPaths();
    return { success: true, message: "商品已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_CART_ITEM_FAILED", message: getErrorMessage(error) } };
  }
}

export async function saveAddress(input: AddressInput, addressId?: string): Promise<ActionResult<{ addressId: string }>> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/account/addresses") as ActionResult<{ addressId: string }>;
  }

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "地址信息不完整") as ActionResult<{ addressId: string }>;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const addressCount = await tx.address.count({ where: { customerId } });
      const shouldDefault = Boolean(parsed.data.isDefault) || addressCount === 0;

      if (shouldDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }

      if (addressId) {
        const updated = await tx.address.updateMany({
          where: { id: addressId, customerId },
          data: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            province: "湖南省",
            city: "湘潭市",
            district: parsed.data.district,
            detail: parsed.data.detail,
            isDefault: shouldDefault,
          },
        });

        if (updated.count === 0) {
          throw new Error("地址不存在");
        }

        return { id: addressId };
      }

      return tx.address.create({
        data: {
          customerId,
          name: parsed.data.name,
          phone: parsed.data.phone,
          province: "湖南省",
          city: "湘潭市",
          district: parsed.data.district,
          detail: parsed.data.detail,
          isDefault: shouldDefault,
        },
        select: { id: true },
      });
    });

    revalidatePath("/shop/checkout");
    revalidatePath("/shop/account/addresses");
    return { success: true, message: addressId ? "地址已更新" : "地址已新增", data: { addressId: result.id } };
  } catch (error) {
    return { success: false, error: { code: "SAVE_ADDRESS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function setDefaultAddress(addressId: string): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/account/addresses");
  }

  try {
    await prisma.$transaction([
      prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } }),
      prisma.address.updateMany({ where: { id: addressId, customerId }, data: { isDefault: true } }),
    ]);
    revalidatePath("/shop/checkout");
    revalidatePath("/shop/account/addresses");
    return { success: true, message: "默认地址已更新" };
  } catch (error) {
    return { success: false, error: { code: "SET_DEFAULT_ADDRESS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/account/addresses");
  }

  try {
    const orderCount = await prisma.order.count({ where: { addressId, customerId } });
    if (orderCount > 0) {
      return { success: false, error: { code: "ADDRESS_IN_USE", message: "该地址已有订单使用，无法删除" } };
    }

    await prisma.address.deleteMany({ where: { id: addressId, customerId } });
    revalidatePath("/shop/checkout");
    revalidatePath("/shop/account/addresses");
    return { success: true, message: "地址已删除" };
  } catch (error) {
    return { success: false, error: { code: "DELETE_ADDRESS_FAILED", message: getErrorMessage(error) } };
  }
}

export async function submitOrder(input: CheckoutInput): Promise<ActionResult<CheckoutResult>> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/checkout") as ActionResult<CheckoutResult>;
  }

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "订单信息不完整") as ActionResult<CheckoutResult>;
  }

  try {
    const result = await prisma.$transaction(async (tx): Promise<CheckoutResult> => {
      const address = await tx.address.findFirst({
        where: { id: parsed.data.addressId, customerId },
        select: { id: true, name: true, phone: true, city: true, district: true, detail: true },
      });

      if (!address) {
        throw new Error("请选择有效收货地址");
      }

      if (address.city !== "湘潭市") {
        throw new Error("当前仅支持湘潭市配送");
      }

      const cartItems = await tx.cartItem.findMany({
        where: { id: { in: parsed.data.cartItemIds }, customerId },
        include: { product: true },
      });

      if (cartItems.length === 0) {
        throw new Error("请选择要结算的商品");
      }

      for (const item of cartItems) {
        if (item.product.status !== "ACTIVE") {
          throw new Error(`${item.product.name} 已下架`);
        }
      }

      const totalAmount = cartItems.reduce((sum, item) => sum + Number(item.product.retailPrice) * item.quantity, 0);
      const bulkConfig = await tx.systemConfig.findUnique({
        where: { key: "bulkOrderAmount" },
        select: { value: true },
      });
      const bulkOrderAmount = configNumberValue(bulkConfig?.value, 500);
      const hasBulkQuantity = cartItems.some((item) => item.quantity >= item.product.bulkThreshold);
      const shouldCreateInquiry = parsed.data.checkoutMode !== "DIRECT_ORDER" || totalAmount >= bulkOrderAmount || hasBulkQuantity;

      if (shouldCreateInquiry) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: {
            id: true,
            name: true,
            phone: true,
            salesPersonId: true,
            dealer: { select: { id: true } },
          },
        });

        if (!customer) {
          throw new Error("客户不存在");
        }

        const scene = inferInquiryScene(parsed.data.checkoutMode);
        const inquiryNo = await generateInquiryNo(tx);
        const salespersonId = customer.salesPersonId ?? null;
        const dealerId = customer.dealer?.id ?? null;
        const items = cartItems.map((item) => ({
          productId: item.productId,
          sku: item.product.sku,
          name: item.product.name,
          unitPrice: Number(item.product.retailPrice),
          quantity: item.quantity,
          totalAmount: Number(item.product.retailPrice) * item.quantity,
          bulkThreshold: item.product.bulkThreshold,
        }));
        const metadata = {
          checkoutMode: parsed.data.checkoutMode,
          totalAmount,
          bulkOrderAmount,
          hasBulkQuantity,
          cartItemIds: cartItems.map((item) => item.id),
        };

        const lead = await tx.lead.create({
          data: {
            source: "SHOP",
            scene,
            status: salespersonId || dealerId ? "ASSIGNED" : "NEW",
            name: customer.name,
            phone: customer.phone,
            customerId,
            salespersonId,
            dealerId,
            notes: parsed.data.remark || null,
            metadata,
            consentAccepted: true,
          },
          select: { id: true },
        });
        const inquiry = await tx.inquiry.create({
          data: {
            inquiryNo,
            scene,
            status: salespersonId || dealerId ? "ASSIGNED" : "NEW",
            leadId: lead.id,
            customerId,
            salespersonId,
            dealerId,
            contactName: address.name || customer.name,
            contactPhone: address.phone || customer.phone,
            budget: toMoney(totalAmount),
            deliveryAddress: `湘潭市${address.district}${address.detail}`,
            needsInvoice: parsed.data.checkoutMode === "GROUP_BUY",
            content: {
              source: "CHECKOUT",
              checkoutMode: parsed.data.checkoutMode,
              items,
              totalAmount,
              bulkOrderAmount,
              payMethod: parsed.data.payMethod,
            },
            notes: parsed.data.remark || null,
          },
          select: { id: true, inquiryNo: true },
        });

        await tx.cartItem.updateMany({
          where: { id: { in: cartItems.map((item) => item.id) }, customerId },
          data: { selected: false },
        });

        return { kind: "INQUIRY", inquiryNo: inquiry.inquiryNo, inquiryId: inquiry.id, leadId: lead.id };
      }

      for (const item of cartItems) {
        if (item.product.stock < item.quantity) {
          throw new Error(`${item.product.name} 库存不足`);
        }
      }

      let discountAmount = 0;
      let couponToUseId: string | null = null;
      let couponIdToIncrement: string | null = null;

      if (parsed.data.customerCouponId) {
        const customerCoupon = await tx.customerCoupon.findFirst({
          where: { id: parsed.data.customerCouponId, customerId },
          include: { coupon: true },
        });
        const now = new Date();

        if (!customerCoupon) {
          throw new Error("优惠券不存在");
        }

        if (customerCoupon.status !== "UNUSED") {
          throw new Error("优惠券已使用或已过期");
        }

        if (!customerCoupon.coupon.isActive || customerCoupon.coupon.startsAt > now || customerCoupon.coupon.endsAt < now) {
          throw new Error("优惠券不在可用时间内");
        }

        const threshold = Number(customerCoupon.coupon.threshold);
        if (totalAmount < threshold) {
          throw new Error("订单金额未达到优惠券使用门槛");
        }

        discountAmount = calculateCouponDiscount(totalAmount, {
          type: customerCoupon.coupon.type,
          amount: customerCoupon.coupon.amount ? Number(customerCoupon.coupon.amount) : null,
          percent: customerCoupon.coupon.percent ? Number(customerCoupon.coupon.percent) : null,
          threshold,
        });

        if (discountAmount <= 0) {
          throw new Error("优惠券暂无可抵扣金额");
        }

        couponToUseId = customerCoupon.id;
        couponIdToIncrement = customerCoupon.couponId;
      }

      const payableAmount = Math.max(0, totalAmount - discountAmount);
      const operator = await tx.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
      });

      if (!operator) {
        throw new Error("未找到库存操作员，请先创建管理员账号");
      }

      const orderNo = await generateOrderNo(tx);
      const createdOrder = await tx.order.create({
        data: {
          orderNo,
          customerId,
          type: "RETAIL",
          status: "PAID",
          totalAmount: toMoney(totalAmount),
          discountAmount: toMoney(discountAmount),
          payableAmount: toMoney(payableAmount),
          paidAmount: toMoney(payableAmount),
          payMethod: parsed.data.payMethod,
          addressId: parsed.data.addressId,
          remark: parsed.data.remark || null,
          routingType: "WAREHOUSE",
          items: {
            create: cartItems.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              sku: item.product.sku,
              unitPrice: item.product.retailPrice,
              quantity: item.quantity,
              totalAmount: toMoney(Number(item.product.retailPrice) * item.quantity),
            })),
          },
          payments: {
            create: {
              customerId,
              type: "RECEIVE",
              amount: toMoney(payableAmount),
              method: parsed.data.payMethod,
              status: "COMPLETED",
              transactionId: `SIM-${orderNo}`,
              paidAt: new Date(),
            },
          },
        },
        select: { id: true, orderNo: true },
      });

      if (couponToUseId && couponIdToIncrement) {
        await tx.customerCoupon.update({
          where: { id: couponToUseId },
          data: { status: "USED", usedAt: new Date(), orderId: createdOrder.id },
        });
        await tx.coupon.update({
          where: { id: couponIdToIncrement },
          data: { usedQuantity: { increment: 1 } },
        });
      }

      for (const item of cartItems) {
        const afterStock = item.product.stock - item.quantity;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: afterStock,
            salesCount: { increment: item.quantity },
            status: afterStock === 0 ? "OUT_OF_STOCK" : "ACTIVE",
          },
        });
        await tx.stockRecord.create({
          data: {
            productId: item.productId,
            type: "OUT",
            quantity: -item.quantity,
            beforeStock: item.product.stock,
            afterStock,
            relatedOrderId: createdOrder.id,
            operatorId: operator.id,
            remark: `商城订单 ${orderNo} 出库`,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { id: { in: cartItems.map((item) => item.id) }, customerId } });
      return { kind: "ORDER", orderNo: createdOrder.orderNo, orderId: createdOrder.id };
    });

    if (result.kind === "ORDER") {
      await routeOrderById(result.orderId);
      await sendOrderStatusTemplate(result.orderId, "paid");
      revalidatePath(`/shop/checkout/success`);
      revalidateShopPaths();
      return { success: true, message: "支付成功，订单已生成", data: result };
    }

    revalidateShopPaths();
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/inquiries");
    revalidatePath(`/shop/checkout/success`);
    return { success: true, message: "已提交询价需求，业务员会尽快联系报价", data: result };
  } catch (error) {
    return { success: false, error: { code: "SUBMIT_ORDER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/my-orders");
  }

  try {
    const operatorId = await getStockOperatorId();
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId },
        include: { customerCoupons: true, items: { include: { product: true } } },
      });

      if (!order) {
        throw new Error("订单不存在");
      }

      if (!["PENDING_PAYMENT", "PAID", "CONFIRMED"].includes(order.status)) {
        throw new Error("当前订单状态不可取消");
      }

      for (const item of order.items) {
        const beforeStock = item.product.stock;
        const afterStock = beforeStock + item.quantity;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: afterStock,
            salesCount: { decrement: Math.min(item.quantity, item.product.salesCount) },
            status: "ACTIVE",
          },
        });
        await tx.stockRecord.create({
          data: {
            productId: item.productId,
            type: "IN",
            quantity: item.quantity,
            beforeStock,
            afterStock,
            relatedOrderId: order.id,
            operatorId,
            remark: `取消订单 ${order.orderNo} 回滚库存`,
          },
        });
      }

      await tx.payment.updateMany({
        where: { orderId: order.id },
        data: { status: "CANCELLED" },
      });
      for (const coupon of order.customerCoupons) {
        await tx.customerCoupon.update({
          where: { id: coupon.id },
          data: { status: "UNUSED", usedAt: null, orderId: null },
        });
        await tx.coupon.update({
          where: { id: coupon.couponId },
          data: { usedQuantity: { decrement: 1 } },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
    });

    revalidateShopPaths();
    revalidatePath(`/shop/my-orders/${orderId}`);
    await sendOrderStatusTemplate(orderId, "cancelled");
    return { success: true, message: "订单已取消，库存已回滚" };
  } catch (error) {
    return { success: false, error: { code: "CANCEL_ORDER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function confirmOrder(orderId: string): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/my-orders");
  }

  try {
    const result = await prisma.order.updateMany({
      where: { id: orderId, customerId, status: { in: ["SHIPPING", "DELIVERED"] } },
      data: { status: "COMPLETED" },
    });

    if (result.count === 0) {
      return { success: false, error: { code: "ORDER_STATUS_INVALID", message: "当前订单无法确认收货" } };
    }

    revalidateShopPaths();
    revalidatePath(`/shop/my-orders/${orderId}`);
    await sendOrderStatusTemplate(orderId, "completed");
    return { success: true, message: "已确认收货" };
  } catch (error) {
    return { success: false, error: { code: "CONFIRM_ORDER_FAILED", message: getErrorMessage(error) } };
  }
}

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const customerId = await getCustomerId();
  if (!customerId) {
    return authError("/shop/account/profile");
  }

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "个人信息不完整");
  }

  try {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { password: true },
    });
    const nextData: { name: string; password?: string } = { name: parsed.data.name };

    if (parsed.data.newPassword) {
      const valid = await compare(parsed.data.oldPassword ?? "", customer.password);
      if (!valid) {
        return { success: false, error: { code: "PASSWORD_INVALID", message: "旧密码不正确" } };
      }

      nextData.password = await hash(parsed.data.newPassword, 12);
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: nextData,
    });
    revalidatePath("/shop/account");
    revalidatePath("/shop/account/profile");
    return { success: true, message: "个人信息已更新" };
  } catch (error) {
    return { success: false, error: { code: "UPDATE_PROFILE_FAILED", message: getErrorMessage(error) } };
  }
}
