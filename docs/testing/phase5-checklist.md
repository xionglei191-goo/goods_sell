# Phase 5 验收清单：微信生态 + 优化

## 小程序

- 使用 `apps/weapp` 独立安装依赖并执行 `npm run dev:weapp`，微信开发者工具导入 `apps/weapp`。
- 配置 `TARO_APP_API_BASE_URL` 指向已部署 H5 域名。
- 微信登录：`wx.login` 调用 `/api/wechat/mini/login`，返回 token 后可访问购物车、结算、订单接口。
- 微信支付：小程序创建订单后调用 `/api/wechat/pay/prepay`，真实商户配置齐全时返回 JSAPI `requestPayment` 参数；未配置时返回 `mocked: true`。
- 支付回调：微信支付通知进入 `/api/wechat/pay/notify`，成功后订单置为 `PAID`，扣库存，写入收款记录，触发分单。
- 分享裂变：小程序 `onShareAppMessage` 调用 `/api/wechat/mini/share` 写入分享事件，后台 `/dashboard/wechat` 可查看。

## 公众号

- 配置 `WECHAT_OFFICIAL_APP_ID`、`WECHAT_OFFICIAL_APP_SECRET`、`WECHAT_OFFICIAL_ORDER_TEMPLATE_ID`。
- 后台 `/dashboard/wechat` 点击“同步公众号菜单”，菜单跳转 `/shop`、`/shop/my-orders`、`/shop/coupons`。
- 订单支付、发货、送达、完成、取消时调用模板消息发送逻辑；未绑定公众号 OpenID 时写入 `SKIPPED` 日志。

## 性能

- 商品列表读取使用 `shop-products` 缓存标签，商品、库存、下单、支付成功后自动失效。
- 产品图片通过 `next/image` 渲染，本地商品占位图位于 `public/images/products`。
- 数据库索引覆盖订单状态、客户订单、支付状态、微信绑定、分享和消息日志。

## 测试

- 本地启动服务后执行 `PHASE5_BASE_URL=http://localhost:3000 npm run test:phase5`。
- 手工走通：注册/登录 → 浏览 → 加购 → 下单 → 分单 → 接单 → 发货 → 收货 → 收款。
- 移动端视口检查：375px、414px、768px。
- 权限检查：未登录不能访问小程序购物车/下单 API；未登录后台不能同步公众号菜单。
