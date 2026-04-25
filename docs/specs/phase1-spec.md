# Phase 1：基础框架 + 进销存 — 开发规格书

> 负责人：代码组 | 审核人：架构师 | 工期：Day 1~4

## Step 1.1 项目初始化（Day 1 上午）

### 开发说明
1. 使用 `npx create-next-app@latest ./` 初始化，选择 TypeScript + App Router + Tailwind CSS + ESLint
2. 安装核心依赖：`prisma @prisma/client next-auth@beta @auth/prisma-adapter`
3. 安装 UI 依赖：`npx shadcn@latest init`，选择 New York 风格、Slate 色系
4. 安装工具依赖：`zod react-hook-form @hookform/resolvers zustand @tanstack/react-query recharts`
5. 配置 `tsconfig.json` 开启 `strict: true`，设置 `@/` 路径别名
6. 创建 `.env.example` 包含所有环境变量模板
7. 按 `docs/03-技术方案.md` 中的目录结构创建所有目录

### 依赖关系
- 无前置依赖，此为首个任务

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | 项目启动 | `npm run dev` 成功启动，浏览器访问 localhost:3000 无报错 |
| 2 | TypeScript | `npx tsc --noEmit` 零错误 |
| 3 | 目录结构 | 存在 `src/app/(auth)`, `(dashboard)`, `(shop)`, `(dealer)`, `src/features/`, `src/components/ui/`, `src/lib/`, `src/types/`, `src/hooks/` |
| 4 | 环境变量 | `.env.example` 包含 DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, AMAP_KEY, NEXT_PUBLIC_APP_NAME |
| 5 | shadcn/ui | `npx shadcn@latest add button` 能正常安装组件 |

---

## Step 1.2 数据库设计与实现（Day 1 下午）

### 开发说明
1. `npx prisma init` 初始化 Prisma，数据源设为 PostgreSQL
2. 按 `docs/04-数据库设计.md` 编写完整 `schema.prisma`
3. **关键字段要求：**
   - 所有金额字段使用 `Decimal @db.Decimal(12,2)`，**禁止使用 Float**
   - 主键使用 `@id @default(cuid())` 或 `@default(uuid())`
   - 所有模型必须包含 `createdAt DateTime @default(now())` 和 `updatedAt DateTime @updatedAt`
   - Product 模型必须包含 `bulkThreshold Int @default(10)` 字段（大单阈值）
   - Category 模型必须支持自引用（`parentId` → 自身）实现多级分类
   - Customer 模型的 `type` 枚举区分 `CONSUMER` 和 `DEALER`
4. 所有外键字段添加 `@relation` 和级联规则
5. 为高频查询字段添加 `@@index`（如 Order.customerId, Order.status, Product.categoryId）
6. 编写 `prisma/seed.ts`：
   - 1个管理员（admin/admin123）、1个销售员、1个仓管、1个财务
   - 三级分类树：酒类(白酒[酱香/浓香/清香], 啤酒, 红酒, 洋酒), 食品(休闲/调味/方便), 饮料(碳酸/果汁/茶/功能)
   - 5个品牌（如茅台、五粮液、青岛啤酒、可口可乐、农夫山泉）
   - 每个二级分类下 3~5 个产品（含完整价格体系和 bulkThreshold）
   - 5个消费者客户 + 3个经销商客户（含坐标，湘潭市范围内）
7. `src/lib/prisma.ts` 创建全局 Prisma 单例（防止开发环境热重载创建多个连接）

### 依赖关系
- 依赖 Step 1.1（项目初始化完成）
- 本地 PostgreSQL 服务运行中

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | 迁移成功 | `npx prisma migrate dev --name init` 无错误，数据库表全部创建 |
| 2 | Seed 成功 | `npx prisma db seed` 无错误，数据正确写入 |
| 3 | 模型完整性 | `npx prisma studio` 打开后可看到所有表，且示例数据正确 |
| 4 | 金额精度 | 数据库中所有金额字段为 `numeric(12,2)` 类型 |
| 5 | 分类层级 | Category 表存在 parentId 自引用，seed 数据包含3级分类 |
| 6 | 产品阈值 | Product 表每条记录有 bulkThreshold 值 |
| 7 | Prisma 单例 | `src/lib/prisma.ts` 导出全局 PrismaClient，使用 `globalThis` 缓存 |
| 8 | 类型生成 | `npx prisma generate` 成功，`@prisma/client` 类型可在代码中导入 |

---

## Step 1.3 认证系统（Day 2 上午）

### 开发说明
1. 配置 Auth.js v5（NextAuth beta），使用 Credentials Provider
2. 认证流程：手机号 + 密码 → 查询 User/Customer 表 → bcrypt 验证 → 返回 JWT
3. JWT payload 包含：`id, name, phone, role, type`（type 区分内部用户和客户）
4. **Middleware 规则（`src/middleware.ts`）：**
   - `/login`, `/register`, `/shop`（首页/目录/详情）— 公开访问
   - `/dashboard/*` — 仅 ADMIN/SALESPERSON/WAREHOUSE/FINANCE
   - `/shop/cart`, `/shop/checkout`, `/shop/my-orders` — 需要消费者登录
   - `/dealer/*` — 仅 DEALER 角色
5. 登录页 `src/app/(auth)/login/page.tsx`：
   - 华启商城 Logo + 品牌色背景
   - 手机号 + 密码表单（Zod 验证）
   - 登录成功后按角色跳转：管理类→`/dashboard`，消费者→`/shop`，经销商→`/dealer/incoming`
   - 错误提示（手机号不存在/密码错误）
6. 注册页 `src/app/(auth)/register/page.tsx`：
   - 仅消费者注册（手机号 + 密码 + 确认密码 + 昵称）
   - 注册成功自动登录跳转商城

### 依赖关系
- 依赖 Step 1.2（User/Customer 模型和 seed 数据）

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | 管理员登录 | seed 的管理员账号可登录，跳转到 /dashboard |
| 2 | 消费者注册 | 新手机号可注册成功并自动登录跳转 /shop |
| 3 | 角色路由保护 | 消费者访问 /dashboard 被重定向到 /login |
| 4 | 未登录保护 | 未登录访问 /shop/cart 被重定向到 /login |
| 5 | 公开页面 | 未登录可正常访问 /shop 商城首页 |
| 6 | 密码加密 | 数据库中密码为 bcrypt hash，非明文 |
| 7 | 错误处理 | 错误手机号/密码显示友好提示，无500错误 |
| 8 | 登录页UI | 页面美观，有华启商城品牌元素，移动端适配 |

---

## Step 1.4 管理后台布局（Day 2 下午）

### 开发说明
1. `src/app/(dashboard)/layout.tsx` — 后台主布局
2. **侧边栏组件** `src/components/layout/Sidebar.tsx`：
   - 宽度 240px（PC），移动端全屏抽屉式
   - 背景色 `#0f172a`（深蓝黑），文字白色
   - 顶部：华启商城 Logo + 折叠按钮
   - 菜单项带图标（使用 Lucide Icons）
   - 当前页高亮，展开/折叠子菜单
   - 底部：用户信息 + 退出登录
   - 菜单结构见 `docs/05-功能模块设计.md`
3. **顶部栏组件** `src/components/layout/Header.tsx`：
   - 面包屑导航（自动根据路由生成）
   - 全局搜索框
   - 通知铃铛图标（后续实现）
   - 用户头像 + 下拉菜单（个人信息/退出）
4. **移动端适配**：
   - 屏幕 < 768px 时隐藏侧边栏，显示汉堡菜单按钮
   - 点击汉堡按钮弹出侧边栏（Overlay 遮罩）
5. 使用 shadcn/ui 的 Sheet 组件实现移动端侧边栏

### 依赖关系
- 依赖 Step 1.3（认证系统，需要用户信息展示）

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | PC布局 | 1280px 宽度下，左侧固定侧边栏 + 右侧内容区正确显示 |
| 2 | 移动端布局 | 375px 宽度下，侧边栏隐藏，汉堡菜单可展开/关闭 |
| 3 | 菜单高亮 | 当前页面对应的菜单项有高亮状态 |
| 4 | 子菜单 | 产品管理/库存管理等有子菜单，可展开折叠 |
| 5 | 面包屑 | 访问 /dashboard/products 显示"仪表盘 > 产品管理" |
| 6 | 用户信息 | 侧边栏底部显示当前登录用户名和角色 |
| 7 | 退出登录 | 点击退出后清除 session，跳转登录页 |
| 8 | 动画流畅 | 侧边栏展开/折叠有平滑过渡动画（300ms） |

---

## Step 1.5 仪表盘首页（Day 2 下午~Day 3 上午）

### 开发说明
1. 路由：`src/app/(dashboard)/page.tsx`
2. **数据卡片区（4列网格，移动端2列）：**
   - 今日订单数（蓝色图标）
   - 今日销售额（绿色图标，格式：¥12,345.00）
   - 新增客户数（紫色图标）
   - 待处理事项数（橙色图标，含：待确认订单+库存预警+逾期应收）
   - 每张卡片显示数值 + 同比昨日趋势箭头（↑ 绿色 / ↓ 红色）
   - Hover 微上浮动画（translateY -2px）
3. **图表区：**
   - 销售趋势（近7天折线图，使用 Recharts AreaChart）
   - 订单状态分布（饼图/环形图）
4. **列表区：**
   - 库存预警 TOP10（产品名/当前库存/安全库存，红色高亮低于安全线的）
   - 应收账款 TOP10（客户名/欠款金额/最早逾期天数）
   - 最近10条订单（订单号/客户/金额/状态/时间）
5. 数据来源：Server Component 直接查询 Prisma
6. 首次可用 seed 数据展示静态效果，后续接入真实数据

### 依赖关系
- 依赖 Step 1.4（后台布局）
- 依赖 Step 1.2（数据库 seed 数据）

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | 数据卡片 | 4张数据卡片正确显示数值，hover 有微动画 |
| 2 | 金额格式 | 所有金额显示为 `¥XX,XXX.XX` 格式 |
| 3 | 趋势图 | 折线图正确渲染近7天数据，有坐标轴和 tooltip |
| 4 | 饼图 | 订单状态分布饼图正确渲染，有图例和百分比 |
| 5 | 库存预警 | 表格正确展示，低库存行有红色标记 |
| 6 | 响应式 | 移动端卡片2列，图表100%宽度，表格可横向滚动 |
| 7 | 加载状态 | 数据加载时显示 Skeleton 骨架屏 |

---

## Step 1.6 产品管理（Day 3）

### 开发说明
1. **产品列表** `src/app/(dashboard)/products/page.tsx`
   - Server Component 获取分页数据
   - 数据表格列：产品图片(缩略图) / 名称 / SKU / 分类 / 品牌 / 零售价 / 库存 / 状态 / 操作
   - 搜索：输入框实时搜索（防抖 300ms），匹配名称和 SKU
   - 筛选：分类下拉（级联）+ 品牌下拉 + 状态下拉
   - 分页：默认 20 条/页，显示总数
   - 操作列：编辑/上架下架/删除（删除需二次确认 Dialog）
   - 顶部操作栏：新增产品按钮 + 批量操作（选中后可批量上下架）
2. **新增/编辑产品** — 使用 Sheet(抽屉) 或独立页面 `/products/new`
   - React Hook Form + Zod 验证
   - 分类：级联选择器（一级→二级→三级）
   - 价格：进价/批发价/零售价/会员价 四个输入框，批发价≤零售价的校验
   - bulkThreshold：大单阈值输入框 + 帮助提示（"超过此数量的订单将由总仓直发"）
   - 图片：上传区域暂用占位图，显示"暂无图片"
   - Server Action 提交
3. **分类管理** `/products/categories`
   - 树形结构展示三级分类
   - 新增子分类（选择父级→输入名称→保存）
   - 编辑/删除（有子分类或关联产品时禁止删除）
4. **品牌管理** `/products/brands`
   - 简单列表+新增/编辑/删除

### 依赖关系
- 依赖 Step 1.4（后台布局）
- 依赖 Step 1.2（Product/Category/Brand 模型）

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | CRUD 完整 | 产品的新增/查看/编辑/删除全流程可正常操作 |
| 2 | 搜索有效 | 输入"茅台"可搜索到对应产品，300ms防抖 |
| 3 | 筛选联动 | 选择分类"白酒"后仅显示白酒产品 |
| 4 | 分页正确 | 数据超过20条时分页按钮正常工作 |
| 5 | 表单验证 | 必填字段为空提交时显示红色错误提示 |
| 6 | 价格校验 | 批发价 > 零售价时表单报错 |
| 7 | 分类级联 | 选择"酒类"后二级显示白酒/啤酒等，选白酒后三级显示酱香/浓香等 |
| 8 | 删除保护 | 删除有关联产品的分类时提示"该分类下有N个产品，无法删除" |
| 9 | 移动端 | 375px 宽度下表格可横向滚动或转为卡片列表 |
| 10 | bulkThreshold | 新增产品时可设置大单阈值，保存后数据库值正确 |

---

## Step 1.7 库存管理（Day 4）

### 开发说明
1. **库存总览** `/inventory`
   - 表格列：产品名 / SKU / 当前库存 / 安全库存 / 状态指示灯 / 库存价值(=库存×进价)
   - 状态指示灯：🟢充足(>安全库存150%) / 🟡偏低(100%~150%) / 🔴预警(<100%) / ⚫缺货(=0)
   - 顶部汇总卡片：总SKU数 / 预警商品数 / 缺货商品数 / 总库存价值
   - 筛选：分类/品牌/预警状态
2. **入库操作** `/inventory/stock-in`
   - 表单：选择产品（Combobox搜索选择）→ 输入数量 → 选择类型(采购入库/退货入库/手动调整) → 备注
   - 提交后：StockRecord 写入（type=IN, quantity=正数），Product.stock += quantity
   - 必须在事务中执行（Prisma transaction）
3. **出库操作** `/inventory/stock-out`
   - 同入库，但需校验库存充足（不能出库超过当前库存）
   - Product.stock -= quantity
4. **变动记录** `/inventory/records`
   - 所有 StockRecord 按时间倒序
   - 筛选：产品/类型(IN/OUT/ADJUST/CHECK)/日期范围
   - 显示：时间/产品/类型/数量(入库绿色+/出库红色-)/变动前/变动后/操作人/备注

### 依赖关系
- 依赖 Step 1.6（产品数据存在）
- 依赖 Step 1.2（StockRecord 模型）

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | 库存预警 | 库存低于安全库存的产品显示红色指示灯 |
| 2 | 入库操作 | 入库后产品库存值正确增加，StockRecord 记录生成 |
| 3 | 出库校验 | 尝试出库超过库存数量时报错提示"库存不足" |
| 4 | 事务安全 | 入库/出库操作使用 Prisma.$transaction，不会出现数据不一致 |
| 5 | 变动流水 | 每次入库/出库都有完整的变动记录，beforeStock/afterStock 正确 |
| 6 | 库存价值 | 汇总卡片的库存价值 = Σ(每个产品库存×进价) |
| 7 | 筛选功能 | 变动记录可按产品/类型/日期筛选 |

---

## Step 1.8 采购基础（Day 4 下午）

### 开发说明
1. **供应商管理** `/purchase/suppliers` — 简单 CRUD 表格
2. **采购订单** `/purchase` — 创建采购单（选供应商→添加产品和数量→提交）
3. 采购单状态：`DRAFT → SUBMITTED → RECEIVED → COMPLETED`
4. 收货时调用入库逻辑（复用 Step 1.7 的入库 Action）

### 验收标准
| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | 供应商CRUD | 新增/编辑/删除/列表正常工作 |
| 2 | 采购创建 | 可创建含多个产品的采购单 |
| 3 | 状态流转 | 采购单可从草稿→提交→收货→完成正确流转 |
| 4 | 收货入库 | 标记收货后自动生成入库记录，库存增加 |
