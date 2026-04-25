import type { Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { routeOrderById } from "@/features/orders/routing";
import { buildOrderNoSequence } from "@/features/orders/utils";
import { sendOrderStatusTemplate } from "@/features/wechat/official";
import { SHOP_PRODUCTS_CACHE_TAG } from "@/features/shop/cache";
import { calculateCouponDiscount, toMoney } from "@/features/shop/utils";
import { prisma } from "@/lib/prisma";

type CreateMiniOrderInput = {
  customerId: string;
  addressId: string;
  cartItemIds: string[];
  customerCouponId?: string | null;
  remark?: string | null;
};

async function generateOrderNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const count = await tx.order.count({ where: { createdAt: { gte: start } } });
  return buildOrderNoSequence(count, now);
}

async function getStockOperatorId(tx: Prisma.TransactionClient) {
  const admin = await tx.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (!admin) {
    throw new Error("未找到库存操作员，请先创建管理员账号");
  }

  return admin.id;
}

function toFen(value: unknown) {
  return Math.round(Number(value) * 100);
}

export async function createMiniProgramOrder(input: CreateMiniOrderInput) {
  return prisma.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id: input.addressId, customerId: input.customerId },
      select: { id: true, city: true },
    });

    if (!address) {
      throw new Error("请选择有效收货地址");
    }

    if (address.city !== "湘潭市") {
      throw new Error("当前仅支持湘潭市配送");
    }

    const cartItems = await tx.cartItem.findMany({
      where: { id: { in: input.cartItemIds }, customerId: input.customerId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      throw new Error("请选择要结算的商品");
    }

    for (const item of cartItems) {
      if (item.product.status !== "ACTIVE") {
        throw new Error(`${item.product.name} 已下架`);
      }

      if (item.product.stock < item.quantity) {
        throw new Error(`${item.product.name} 库存不足`);
      }
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + Number(item.product.retailPrice) * item.quantity, 0);
    let discountAmount = 0;
    let customerCouponId: string | null = null;
    let couponIdToIncrement: string | null = null;

    if (input.customerCouponId) {
      const customerCoupon = await tx.customerCoupon.findFirst({
        where: { id: input.customerCouponId, customerId: input.customerId },
        include: { coupon: true },
      });
      const now = new Date();

      if (!customerCoupon) throw new Error("优惠券不存在");
      if (customerCoupon.status !== "UNUSED") throw new Error("优惠券已使用或已过期");
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

      customerCouponId = customerCoupon.id;
      couponIdToIncrement = customerCoupon.couponId;
    }

    const payableAmount = Math.max(0, totalAmount - discountAmount);
    const orderNo = await generateOrderNo(tx);
    const order = await tx.order.create({
      data: {
        orderNo,
        customerId: input.customerId,
        type: "RETAIL",
        status: "PENDING_PAYMENT",
        source: "MINI_PROGRAM",
        totalAmount: toMoney(totalAmount),
        discountAmount: toMoney(discountAmount),
        payableAmount: toMoney(payableAmount),
        paidAmount: "0.00",
        payMethod: "WECHAT",
        addressId: input.addressId,
        remark: input.remark || null,
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
            customerId: input.customerId,
            type: "RECEIVE",
            amount: toMoney(payableAmount),
            method: "WECHAT",
            status: "PENDING",
            transactionId: `MINI-PREPAY-${orderNo}`,
          },
        },
      },
      select: { id: true, orderNo: true, payableAmount: true },
    });

    if (customerCouponId && couponIdToIncrement) {
      await tx.customerCoupon.update({
        where: { id: customerCouponId },
        data: { status: "USED", usedAt: new Date(), orderId: order.id },
      });
      await tx.coupon.update({
        where: { id: couponIdToIncrement },
        data: { usedQuantity: { increment: 1 } },
      });
    }

    return {
      id: order.id,
      orderNo: order.orderNo,
      payableAmount: Number(order.payableAmount),
      amountFen: toFen(order.payableAmount),
    };
  });
}

export async function markWechatOrderPaid(input: { orderNo: string; transactionId: string; amountFen: number }) {
  const operatorId = await prisma.$transaction((tx) => getStockOperatorId(tx));
  const paid = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNo: input.orderNo },
      include: {
        items: { include: { product: true } },
        payments: true,
      },
    });

    if (!order) {
      throw new Error("支付回调订单不存在");
    }

    if (order.status === "PAID" || order.status === "CONFIRMED" || order.status === "SHIPPING" || order.status === "DELIVERED" || order.status === "COMPLETED") {
      return { id: order.id, alreadyPaid: true };
    }

    if (order.status !== "PENDING_PAYMENT") {
      throw new Error("订单当前状态不可支付");
    }

    if (input.amountFen < toFen(order.payableAmount)) {
      throw new Error("支付金额小于订单应付金额");
    }

    for (const item of order.items) {
      if (item.product.stock < item.quantity) {
        throw new Error(`${item.product.name} 库存不足，无法完成支付`);
      }
    }

    for (const item of order.items) {
      const beforeStock = item.product.stock;
      const afterStock = beforeStock - item.quantity;
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
          beforeStock,
          afterStock,
          relatedOrderId: order.id,
          operatorId,
          remark: `微信小程序订单 ${order.orderNo} 支付出库`,
        },
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAmount: order.payableAmount,
        payMethod: "WECHAT",
      },
    });
    await tx.payment.updateMany({
      where: { orderId: order.id, method: "WECHAT", type: "RECEIVE" },
      data: {
        status: "COMPLETED",
        paidAt: new Date(),
        transactionId: input.transactionId,
      },
    });
    await tx.cartItem.deleteMany({
      where: {
        customerId: order.customerId,
        productId: { in: order.items.map((item) => item.productId) },
      },
    });

    return { id: order.id, alreadyPaid: false };
  });

  if (!paid.alreadyPaid) {
    await routeOrderById(paid.id);
    await sendOrderStatusTemplate(paid.id, "paid");
    revalidateTag(SHOP_PRODUCTS_CACHE_TAG);
    revalidatePath("/shop");
    revalidatePath("/shop/catalog");
    revalidatePath("/shop/cart");
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/inventory");
  }

  return paid;
}
