import { Button, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/services/api";
import { createMiniOrder, requestWechatPay } from "@/services/pay";

type CheckoutData = {
  items: Array<{ id: string; name: string; price: number; quantity: number; subtotal: number }>;
  addresses: Array<{ id: string; name: string; phone: string; district: string; detail: string; isDefault: boolean }>;
  totalAmount: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const [data, setData] = useState<CheckoutData | null>(null);
  const selectedAddress = useMemo(() => data?.addresses.find((address) => address.isDefault) ?? data?.addresses[0], [data]);

  useEffect(() => {
    const ids = router.params.cartItemIds ? `?cartItemIds=${router.params.cartItemIds}` : "";
    apiRequest<CheckoutData>(`/api/wechat/mini/checkout${ids}`).then(setData).catch((error) => Taro.showToast({ title: error.message, icon: "none" }));
  }, [router.params.cartItemIds]);

  async function submit() {
    if (!data || !selectedAddress) {
      await Taro.showToast({ title: "请先维护收货地址", icon: "none" });
      return;
    }

    const order = await createMiniOrder({
      addressId: selectedAddress.id,
      cartItemIds: data.items.map((item) => item.id),
    });
    await requestWechatPay(order.id);
    await Taro.redirectTo({ url: "/pages/account/index" });
  }

  return (
    <ScrollView className="page" scrollY>
      <View className="card">
        <Text style={{ fontSize: 24, fontWeight: 700 }}>确认订单</Text>
        <Text className="muted" style={{ display: "block", marginTop: 8 }}>微信 JSAPI 支付，支付成功后自动分单</Text>
      </View>

      <View className="card" style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: 700 }}>收货地址</Text>
        {selectedAddress ? (
          <Text className="muted" style={{ display: "block", marginTop: 8 }}>{selectedAddress.name} {selectedAddress.phone} · {selectedAddress.district}{selectedAddress.detail}</Text>
        ) : (
          <Text className="muted" style={{ display: "block", marginTop: 8 }}>暂无地址，请到 H5 个人中心维护</Text>
        )}
      </View>

      {data?.items.map((item) => (
        <View className="card" key={item.id} style={{ marginTop: 14 }}>
          <Text style={{ display: "block", fontWeight: 700 }}>{item.name}</Text>
          <Text className="muted" style={{ display: "block", marginTop: 6 }}>¥{item.price.toFixed(2)} x {item.quantity}</Text>
        </View>
      ))}

      <View className="card" style={{ marginTop: 14 }}>
        <Text>应付合计</Text>
        <Text style={{ display: "block", color: "#dc2626", fontSize: 28, fontWeight: 700, marginTop: 8 }}>¥{(data?.totalAmount ?? 0).toFixed(2)}</Text>
      </View>

      <Button className="button" disabled={!data?.items.length} onClick={submit} style={{ marginTop: 18 }}>
        微信支付
      </Button>
    </ScrollView>
  );
}
