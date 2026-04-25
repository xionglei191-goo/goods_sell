import Taro from "@tarojs/taro";

import { apiRequest } from "@/services/api";

type MiniOrder = {
  id: string;
  orderNo: string;
  payableAmount: number;
  amountFen: number;
};

type PrepayResult = {
  mocked: boolean;
  prepayId: string;
  payParams: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: "RSA";
    paySign: string;
  };
};

export async function createMiniOrder(input: { addressId: string; cartItemIds: string[]; customerCouponId?: string; remark?: string }) {
  return apiRequest<MiniOrder>("/api/wechat/mini/orders", {
    method: "POST",
    data: input,
  });
}

export async function requestWechatPay(orderId: string) {
  const prepay = await apiRequest<PrepayResult>("/api/wechat/pay/prepay", {
    method: "POST",
    data: { orderId },
  });

  if (prepay.mocked) {
    await Taro.showToast({ title: "模拟支付成功", icon: "success" });
    return prepay;
  }

  await Taro.requestPayment(prepay.payParams);
  return prepay;
}
