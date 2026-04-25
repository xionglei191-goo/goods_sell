import { defineAppConfig } from "@tarojs/taro";

export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/catalog/index",
    "pages/cart/index",
    "pages/checkout/index",
    "pages/account/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#dc2626",
    navigationBarTitleText: "华启商城",
    navigationBarTextStyle: "white",
  },
  tabBar: {
    color: "#78716c",
    selectedColor: "#dc2626",
    backgroundColor: "#ffffff",
    list: [
      { pagePath: "pages/index/index", text: "首页" },
      { pagePath: "pages/catalog/index", text: "分类" },
      { pagePath: "pages/cart/index", text: "购物车" },
      { pagePath: "pages/account/index", text: "我的" },
    ],
  },
});
