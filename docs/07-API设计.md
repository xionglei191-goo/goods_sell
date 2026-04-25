# 华启商城 — API 设计

## 1. API 规范

- **风格**：主要使用 Next.js Server Actions（非 REST API）
- **数据格式**：JSON
- **认证方式**：JWT Token (通过 NextAuth.js)
- **错误格式**：`{ success: false, error: { code: string, message: string } }`
- **成功格式**：`{ success: true, data: T }`
- **分页格式**：`{ items: T[], total: number, page: number, pageSize: number }`

## 2. Server Actions 清单

### 2.1 认证模块 (features/auth/actions.ts)
```typescript
signIn(phone: string, password: string): Promise<Session>
signUp(data: SignUpInput): Promise<Customer>
sendVerifyCode(phone: string): Promise<void>
verifyCode(phone: string, code: string): Promise<boolean>
resetPassword(phone: string, code: string, newPassword: string): Promise<void>
```

### 2.2 产品模块 (features/products/actions.ts)
```typescript
getProducts(filters: ProductFilters): Promise<PaginatedResult<Product>>
getProduct(id: string): Promise<Product>
createProduct(data: ProductInput): Promise<Product>
updateProduct(id: string, data: ProductInput): Promise<Product>
deleteProduct(id: string): Promise<void>
getCategories(): Promise<Category[]>
createCategory(data: CategoryInput): Promise<Category>
getBrands(): Promise<Brand[]>
createBrand(data: BrandInput): Promise<Brand>
```

### 2.3 库存模块 (features/inventory/actions.ts)
```typescript
getStockList(filters: StockFilters): Promise<PaginatedResult<StockView>>
stockIn(data: StockInInput): Promise<StockRecord>
stockOut(data: StockOutInput): Promise<StockRecord>
getStockRecords(productId: string): Promise<StockRecord[]>
createStockCheck(data: StockCheckInput): Promise<StockCheck>
confirmStockCheck(id: string): Promise<void>
```

### 2.4 订单模块 (features/orders/actions.ts)
```typescript
getOrders(filters: OrderFilters): Promise<PaginatedResult<Order>>
getOrder(id: string): Promise<OrderDetail>
createOrder(data: CreateOrderInput): Promise<Order>
updateOrderStatus(id: string, status: OrderStatus): Promise<Order>
cancelOrder(id: string, reason: string): Promise<void>
routeOrder(orderId: string): Promise<OrderRouting>
```

### 2.5 客户模块 (features/customers/actions.ts)
```typescript
getCustomers(filters: CustomerFilters): Promise<PaginatedResult<Customer>>
getCustomer(id: string): Promise<CustomerDetail>
createCustomer(data: CustomerInput): Promise<Customer>
updateCustomer(id: string, data: CustomerInput): Promise<Customer>
addCustomerVisit(data: VisitInput): Promise<CustomerVisit>
```

### 2.6 财务模块 (features/finance/actions.ts)
```typescript
getReceivables(filters: FinanceFilters): Promise<ReceivableSummary[]>
recordPayment(data: PaymentInput): Promise<Payment>
getPayments(filters: PaymentFilters): Promise<PaginatedResult<Payment>>
generateStatement(customerId: string, dateRange: DateRange): Promise<Statement>
getProfitReport(filters: ProfitFilters): Promise<ProfitReport>
```

### 2.7 商城模块 (features/shop/actions.ts)
```typescript
getShopProducts(filters: ShopFilters): Promise<PaginatedResult<ShopProduct>>
getShopProduct(id: string): Promise<ShopProductDetail>
addToCart(productId: string, quantity: number): Promise<CartItem>
getCart(): Promise<Cart>
updateCartItem(itemId: string, quantity: number): Promise<CartItem>
removeCartItem(itemId: string): Promise<void>
createShopOrder(data: CheckoutInput): Promise<Order>
getMyOrders(filters: OrderFilters): Promise<PaginatedResult<Order>>
```

### 2.8 经销商模块 (features/dealers/actions.ts)
```typescript
getDealerOrders(filters: DealerOrderFilters): Promise<PaginatedResult<Order>>
acceptOrder(routingId: string): Promise<OrderRouting>
rejectOrder(routingId: string, reason: string): Promise<OrderRouting>
reportStock(data: DealerStockInput): Promise<DealerStock>
getDealerSettlement(dateRange: DateRange): Promise<Settlement>
```

### 2.9 AI模块 (features/ai/actions.ts)
```typescript
sendMessage(message: string): Promise<AIChatResponse>
getChatHistory(customerId: string): Promise<ChatMessage[]>
getUserProfile(customerId: string): Promise<UserProfile>
getPersonalRecommendations(customerId: string): Promise<Product[]>
```

## 3. API Routes（外部接口）

仅用于第三方回调：
```
POST /api/webhooks/wechat-pay  — 微信支付回调
POST /api/ai/chat              — AI对话流式响应(SSE)
```

## 4. 数据类型定义

关键类型定义在 `src/types/` 目录下，按模块组织，与 Prisma 生成的类型对齐。
