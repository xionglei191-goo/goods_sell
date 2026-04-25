import { Button, ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { apiRequest } from "@/services/api";
import { loginWithWechat } from "@/services/auth";

type Order = {
  id: string;
  orderNo: string;
  statusLabel: string;
  payableAmount: number;
};

export default function AccountPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  async function loadOrders() {
    const data = await apiRequest<Order[]>("/api/wechat/mini/orders");
    setOrders(data);
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  async function login() {
    await loginWithWechat();
    await loadOrders();
    await Taro.showToast({ title: "登录成功", icon: "success" });
  }

  return (
    <ScrollView className="page" scrollY>
      <View className="card">
        <Text style={{ fontSize: 24, fontWeight: 700 }}>我的华启</Text>
        <Text className="muted" style={{ display: "block", marginTop: 8 }}>订单、支付和服务通知</Text>
        <Button className="button" onClick={login} style={{ marginTop: 18 }}>微信登录 / 刷新订单</Button>
      </View>

      {orders.map((order) => (
        <View className="card" key={order.id} style={{ marginTop: 14 }}>
          <Text style={{ display: "block", fontWeight: 700 }}>{order.orderNo}</Text>
          <Text className="muted" style={{ display: "block", marginTop: 6 }}>{order.statusLabel}</Text>
          <Text style={{ display: "block", color: "#dc2626", marginTop: 8 }}>¥{order.payableAmount.toFixed(2)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
