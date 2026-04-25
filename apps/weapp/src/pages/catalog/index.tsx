import { Button, Input, ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { apiRequest } from "@/services/api";

type Product = {
  id: string;
  name: string;
  brandName: string;
  spec: string | null;
  retailPrice: number;
  stock: number;
};

type CatalogData = {
  products: Product[];
};

export default function CatalogPage() {
  const [keyword, setKeyword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  async function loadCatalog(q = "") {
    const data = await apiRequest<CatalogData>(`/api/wechat/mini/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setProducts(data.products);
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  async function addToCart(productId: string) {
    await apiRequest<void>("/api/wechat/mini/cart", {
      method: "POST",
      data: { productId, quantity: 1 },
    });
    await Taro.switchTab({ url: "/pages/cart/index" });
  }

  return (
    <ScrollView className="page" scrollY>
      <View className="card">
        <Input onInput={(event) => setKeyword(String(event.detail.value))} placeholder="搜索商品 / 品牌 / SKU" value={keyword} />
        <Button className="button" onClick={() => loadCatalog(keyword)} style={{ marginTop: 12 }}>搜索</Button>
      </View>

      <View style={{ marginTop: 18 }}>
        {products.map((product) => (
          <View className="card" key={product.id} style={{ marginBottom: 14 }}>
            <Text style={{ display: "block", fontWeight: 700 }}>{product.name}</Text>
            <Text className="muted" style={{ display: "block", marginTop: 6 }}>{product.brandName} · {product.spec ?? "整件"}</Text>
            <View style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <Text style={{ color: "#dc2626", fontWeight: 700 }}>¥{product.retailPrice.toFixed(2)}</Text>
              <Button onClick={() => addToCart(product.id)} size="mini">选购</Button>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
