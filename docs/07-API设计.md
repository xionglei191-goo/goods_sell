# 华启酒饮数字渠道平台 — API 设计

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
evaluateRoutingPolicy(orderId: string): Promise<RoutingDecision> // 距离、库存、服务能力、历史响应、冲突/拒单综合评分
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
updateDealerPolicy(data: DealerPolicyInput): Promise<DealerPolicy>
getDealerPromotionStats(dealerId: string): Promise<PromotionStats>
```

### 2.9 AI模块 (features/ai/actions.ts)
```typescript
sendMessage(message: string): Promise<AIChatResponse>
getChatHistory(customerId: string): Promise<ChatMessage[]>
getUserProfile(customerId: string): Promise<UserProfile>
getPersonalRecommendations(customerId: string): Promise<Product[]>
extractChannelIntent(message: string): ChannelAiSuggestion | null // 内部识别宴席、团购/送礼、门店补货、新品试饮
createScenarioInquiry(scene: ScenarioType, data: ScenarioInquiryInput): Promise<Inquiry>
```

### 2.9.1 AI Tools 与代办助手（Phase 11）
```typescript
type AiToolRiskLevel = "READ" | "DRAFT" | "WRITE" | "HIGH_RISK"

type AiToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: z.ZodTypeAny
  riskLevel: AiToolRiskLevel
  access?: {
    roles?: AppRole[]
    permission?: DashboardPermission
  }
  resolvePermission?: (input: AnyToolInput, context: AiToolContext) => DashboardPermission | null
  handler: (input: AnyToolInput, context: AiToolContext) => Promise<AiToolResult>
  buildConfirmation?: (
    input: AnyToolInput,
    context: AiToolContext
  ) => Promise<ConfirmationCard>
}

type AiAssistantCard =
  | { kind: "result"; title: string; summary: string; details: AiToolDetail[]; href?: string }
  | { kind: "confirmation"; pendingAction: AiPendingAction }
```

已注册 tool 分组：

| 分组 | 代表 tools |
|------|------------|
| 客户服务 | `search_products`、`customer_context`、`customer_submit_order`、`customer_orders`、`customer_receivables` |
| 经营查询 | `business_overview`、`salesperson_performance`、`search_customers`、`product_operations_summary`、`finance_summary`、`delivery_summary`、`channel_summary` |
| 管理操作 | `admin_update_product_price`、`order_status_action`、`inventory_stock_in`、`finance_register_payment`、`settings_save_business_config` |
| 经销商 | `dealer_incoming_orders`、`dealer_report_stock`、`dealer_accept_routing`、`dealer_reject_routing` |
| 营销与系统 | `marketing_create_coupon`、`marketing_issue_coupon`、`marketing_create_product_push`、`system_launch_readiness` |

执行约定：
- `READ` 查询直接执行。
- `DRAFT` 只返回草稿卡。
- `WRITE` 返回确认卡，确认 API 校验 token 后执行。
- `HIGH_RISK` 除 token 外还要求指定确认文字。
- Tool handler 必须复用现有业务 action/query，不允许绕过权限直接写库。

### 2.10 线索/询价模块（Phase 7 规划）
```typescript
createLead(data: LeadInput): Promise<Lead>
getLeads(filters: LeadFilters): Promise<PaginatedResult<Lead>>
assignLead(leadId: string, salespersonId: string): Promise<Lead>
createInquiry(data: InquiryInput): Promise<Inquiry>
updateInquiryStatus(id: string, status: InquiryStatus): Promise<Inquiry>
createQuote(data: QuoteInput): Promise<Quote>
convertQuoteToOrder(quoteId: string): Promise<Order>
```

### 2.11 推广码与渠道经营（Phase 7 规划）
```typescript
createPromoterCode(data: PromoterCodeInput): Promise<PromoterCode>
resolvePromoterCode(code: string): Promise<PromoterContext>
recordPromoterVisit(data: PromoterVisitInput): Promise<void>
bindDealerPilot(data: { salespersonId: string; dealerIds: string[]; generateSalespersonCode: boolean; generateDealerCodes: boolean }): Promise<PilotBindResult>
createProductPush(data: ProductPushInput): Promise<ProductPush>
recordProductPushEvent(id: string, event: PushEvent): Promise<void>
reviewProductPushFunnel(productId?: string, targetTag?: string): Promise<ProductPushReview>
createChannelConflict(data: ChannelConflictInput): Promise<ChannelConflict>
updateChannelConflict(id: string, status: ConflictStatus, ownerId?: string, note?: string): Promise<ChannelConflict>
```

### 2.12 权限与经销商审核（Phase 10）
```typescript
canAccessPath(role: AppRole | null | undefined, pathname: string): boolean
filterDashboardNavItems(role: AppRole | null | undefined): DashboardNavItem[]
requireRole(roles: AppRole[]): Promise<SessionUser>
requireDashboardPermission(permission: DashboardPermission): Promise<SessionUser>

registerCustomer(data: RegisterInput): Promise<
  | { success: true; accountType: "CONSUMER"; status: "ACTIVE" }
  | { success: true; accountType: "DEALER"; status: "PENDING_REVIEW" }
  | { success: false; error: { code: string; message: string } }
>

approveDealerApplication(data: {
  leadId: string
  shopName: string
  zone: string
  latitude: number
  longitude: number
  serviceRadius: number
  businessLicense?: string
  salesPersonId?: string
  notes?: string
}): Promise<ActionResult<{ dealerId: string }>>

rejectDealerApplication(data: {
  leadId: string
  reason: string
}): Promise<ActionResult>
```

权限错误约定：
- 未登录由 middleware 跳转 `/login?callbackUrl=...`。
- 已登录越权由 middleware 跳转 `/forbidden`。
- Server Action 返回 `UNAUTHORIZED` 或抛出“无权限...”错误，避免只依赖前端隐藏按钮。

### 2.13 业务员绩效（Phase 9 已上线）
```typescript
getSalespersonManagementData(filters: SalespersonFilters): Promise<{
  summary: {
    total: number
    active: number
    dealers: number
    customers: number
    leads: number
    convertedLeads: number
    leadConversionRate: number
    quotes: number
    convertedQuotes: number
    quoteConversionRate: number
    buyingCustomers: number
    repeatCustomers: number
    repeatRate: number
    promoterScans: number
    revenue: number
    receivable: number
  }
  items: SalespersonPerformanceItem[]
}>
```

### 2.14 公司经营看板（Phase 9 已上线）
```typescript
getCompanyOperationsData(): Promise<{
  summary: {
    revenue30d: number
    orderCount30d: number
    zoneCount: number
    dealerCount: number
    activeDealerCount: number
    riskDealerCount: number
    customerCount: number
    leadCount30d: number
    salespersonScanCount: number
    salespersonLeadCount: number
    pushConversionRate: number
    openConflicts: number
  }
  zones: ZoneOperationItem[]
  dealerTiers: Record<DealerTier, number>
  customerSegments: CustomerSegmentOperationItem[]
  salespeople: SalespersonGroundPushItem[]
  productPushes: ProductPushReviewItem[]
  conflictTrend: ChannelConflictTrendItem[]
}>
```

## 3. API Routes（外部接口）

API Routes 用于第三方回调、微信生态、AI 流式接口和少量外部入口：
```
POST /api/webhooks/wechat-pay  — 微信支付回调
POST /api/ai/chat              — AI对话流式响应(SSE)
POST /api/ai/assistant         — AI悬浮气泡对话与tool调用(SSE)
POST /api/ai/assistant/confirm — AI待确认tool执行
GET  /api/promoters/[code]     — 推广码解析与来源上下文
POST /api/wechat/mini/share    — 小程序分享/裂变事件
```

### 3.1 AI Assistant 请求与响应

`POST /api/ai/assistant`

```json
{
  "message": "这个月张军的业绩怎么样",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

SSE 事件：

| 事件 | data |
|------|------|
| `delta` | `{ "text": "..." }` |
| `card` | 查询结果卡或确认卡 |
| `done` | `{ "ok": true }` |
| `error` | `{ "message": "请先登录后再使用 AI 助手" }` |

`POST /api/ai/assistant/confirm`

```json
{
  "toolName": "admin_update_product_price",
  "args": { "productQuery": "剑兰春", "newRetailPrice": 168 },
  "confirmationToken": "signed-token",
  "confirmText": "确认调价"
}
```

确认 API 会校验 token、当前用户、角色、tool、参数、风险等级和有效期；校验失败不会执行 handler。

## 4. 数据类型定义

关键类型定义在 `src/types/` 目录下，按模块组织，与 Prisma 生成的类型对齐。
