import { Button, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useShareAppMessage } from "@tarojs/taro";
import { useEffect, useState } from "react";

import { apiRequest } from "@/services/api";
import { loginWithWechat } from "@/services/auth";
import { trackShare } from "@/services/share";

type HomeData = {
  banners: Array<{ id: string; title: string; subtitle: string; href: string }>;
  categories: Array<{ slug: string; label: string; count: number }>;
  hotProducts: Array<{ id: string; name: string; retailPrice: number }>;
};

export default function IndexPage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loginText, setLoginText] = useState("微信一键登录");

  useEffect(() => {
    apiRequest<HomeData>("/api/wechat/mini/home").then(setData).catch(() => undefined);
  }, []);

  useShareAppMessage(() => {
    const path = "/pages/index/index";
    void trackShare({ scene: "home", title: "华启商城，湘潭本地好货", path });
    return {
      title: "华启商城，湘潭本地好货",
      path,
    };
  });

  async function handleLogin() {
    const result = await loginWithWechat();
    setLoginText(result.mock ? "已登录（模拟模式）" : "已登录");
  }

  return (
    <ScrollView className="page" scrollY>
      <View className="card">
        <Text style={{ display: "block", fontSize: 28, fontWeight: 700 }}>华启商城</Text>
        <Text className="muted" style={{ display: "block", marginTop: 8 }}>湘潭本地酒水、食品、饮料配送</Text>
        <Button className="button" onClick={handleLogin} style={{ marginTop: 18 }}>{loginText}</Button>
      </View>

      <View className="card" style={{ marginTop: 18 }}>
        <Text style={{ fontWeight: 700 }}>快捷分类</Text>
        <View style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {data?.categories.map((category) => (
            <Button key={category.slug} onClick={() => Taro.navigateTo({ url: `/pages/catalog/index?category=${category.slug}` })} size="mini">
              {category.label} {category.count}
            </Button>
          ))}
        </View>
      </View>

      <View className="card" style={{ marginTop: 18 }}>
        <Text style={{ fontWeight: 700 }}>热门推荐</Text>
        {data?.hotProducts.slice(0, 8).map((product) => (
          <View key={product.id} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #f5f5f4" }}>
            <Text>{product.name}</Text>
            <Text style={{ color: "#dc2626", fontWeight: 700 }}>¥{product.retailPrice.toFixed(2)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
