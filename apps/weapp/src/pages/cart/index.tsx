import { Button, ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/services/api";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selected: boolean;
  subtotal: number;
};

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const totalAmount = useMemo(() => items.filter((item) => item.selected).reduce((sum, item) => sum + item.subtotal, 0), [items]);

  async function loadCart() {
    const data = await apiRequest<CartItem[]>("/api/wechat/mini/cart");
    setItems(data);
  }

  useEffect(() => {
    void loadCart();
  }, []);

  return (
    <ScrollView className="page" scrollY>
      <View className="card">
        <Text style={{ fontSize: 24, fontWeight: 700 }}>购物车</Text>
        <Text className="muted" style={{ display: "block", marginTop: 8 }}>已选 ¥{totalAmount.toFixed(2)}</Text>
      </View>

      {items.map((item) => (
        <View className="card" key={item.id} style={{ marginTop: 14 }}>
          <Text style={{ display: "block", fontWeight: 700 }}>{item.name}</Text>
          <Text className="muted" style={{ display: "block", marginTop: 6 }}>x{item.quantity}</Text>
          <Text style={{ display: "block", color: "#dc2626", marginTop: 8 }}>¥{item.subtotal.toFixed(2)}</Text>
        </View>
      ))}

      <Button className="button" disabled={items.length === 0} onClick={() => Taro.navigateTo({ url: `/pages/checkout/index?cartItemIds=${items.map((item) => item.id).join(",")}` })} style={{ marginTop: 18 }}>
        去结算
      </Button>
    </ScrollView>
  );
}
