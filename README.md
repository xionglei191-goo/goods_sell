# 华启酒饮数字渠道平台 (HuaQi Channel)

> 面向区域酒水饮料总代的 AI-native 数字渠道系统：获客、询价、渠道保护、经销商协同、进销存、财务与 AI 代办。

## English Brief

HuaQi Channel is an AI-assisted business application for regional beverage distribution. It is not a traditional B2C store. The core problem is how a regional distributor can collect demand from customers, protect dealer channels, route orders fairly, manage inventory and finance, and let an AI assistant safely operate business workflows through permission-aware tools.

The repository explores a reusable pattern for AI-native business systems:

- intent understanding and parameter planning;
- role-based tool availability;
- schema validation before execution;
- confirmation cards for write operations;
- high-risk second confirmation;
- audit logging and sensitive-field redaction;
- fallback behavior when the model provider is unavailable.

## 项目定位

传统区域批发分销企业常见的问题不是“没有商城”，而是：

- 客户需求分散在业务员、经销商、微信私域和线下询价中；
- 总代希望做数字化获客，但又不能破坏已有经销商体系；
- 老板、销售、仓库、财务、经销商、消费者的权限边界不同；
- 后台菜单复杂，真实业务用户更希望“说一句话，把事情办完”；
- AI 可以提升效率，但不能绕开权限、确认和审计直接写库。

本项目把这些问题收敛为一套可运行的业务系统。它既是一个酒饮渠道平台，也是一个面向中小企业场景的 AI agent 业务执行样板。

## 核心业务闭环

```text
品牌厂商
   ↓
区域总代理
   ↓
业务员地推 / 经销商私域 / 客户场景入口
   ↓
线索、询价、下单、AI 互动画像
   ↓
渠道保护分单引擎
   ↓
小单就近经销商履约 / 大单与团购进入公司或业务员报价
   ↓
库存、配送、收款、开票、复购和营销复盘
```

## 功能范围

| 模块 | 说明 |
| --- | --- |
| 商城与客户入口 | 商品浏览、购物车、订单、地址、优惠券、个人资料、场景化询价 |
| 渠道保护 | 经销商服务半径、接单金额范围、品牌权限、拒单转派、渠道冲突处理 |
| 线索与报价 | 地推码、推广码、客户归属、询价、报价转订单 |
| 进销存 | 商品、品牌、分类、采购、供应商、库存流水、盘点、安全库存 |
| 订单履约 | 手动开单、订单状态流转、经销商接单、仓库发货、配送管理 |
| 财务与票据 | 收款登记、客户应收、对账摘要、发票信息与开票动作 |
| 营销 | 优惠券、新品推送、客户标签、AI 画像和精准触达 |
| 权限与审计 | 六类角色、路由权限、字段权限、操作日志、AI 调用审计 |
| AI 代办助手 | 全端悬浮气泡、自然语言查询、草稿、确认卡、工具执行 |
| 上线检查 | 系统配置、第三方边界、程序完整度和运营验收检查脚本 |

## AI Agent 架构

```text
AiFloatingBubble
   │
   ├─ GET /api/ai/quick-prompts
   │      按角色加载固定高频词条
   │
   └─ POST /api/ai/assistant
          SSE 返回 delta / card / done / error
          │
          ▼
      assistant-service
          │
          ├─ context
          │    读取当前用户、角色、账号类型和数据范围
          │
          ├─ intent-templates
          │    固定词条本地命中，按角色隔离
          │
          ├─ planner
          │    高置信本地规则生成 tool plan
          │
          ├─ provider
          │    复杂自由输入调用 Anthropic/OpenAI-compatible provider
          │
          ├─ registry
          │    统一声明 tool、schema、权限、风险等级和 handler
          │
          ├─ executor
          │    参数校验、权限校验、确认卡、handler 调用和错误归一
          │
          ├─ audit
          │    AI 调用与写操作审计，敏感字段脱敏
          │
          └─ prompt-usage
               记录高频问法候选，人工审核后再沉淀
```

AI 助手不是一个聊天装饰层，而是业务系统的操作入口。它可以帮助不同角色完成查询、草稿、确认和执行，但所有动作都必须经过服务端权限、参数 schema、风险等级和审计链路。

## AI 工具安全边界

| 边界 | 实现方式 |
| --- | --- |
| 不直接写库 | AI tool handler 复用既有业务 action、query、权限守卫和 `logAction()` |
| 角色隔离 | `DashboardPermission`、角色矩阵、菜单过滤、路由校验和 tool access 使用同一套权限模型 |
| 参数约束 | 每个 tool 必须声明 Zod `inputSchema`，执行前统一校验 |
| 风险分级 | `READ`、`DRAFT`、`WRITE`、`HIGH_RISK` 四类风险等级 |
| 写操作确认 | `WRITE` 和 `HIGH_RISK` 先生成确认卡，用户确认后才执行 |
| 高风险二次确认 | `HIGH_RISK` 需要输入指定确认文字，适用于审核、禁用账号、系统参数、批量发券等动作 |
| 防篡改确认 | confirmation token 使用 HMAC 绑定用户、角色、tool、参数、风险等级和过期时间 |
| 审计与脱敏 | tool 调用、越权请求、确认卡、执行结果和失败原因写入审计，并脱敏敏感字段 |
| 模型不可用兜底 | 固定词条和本地高置信 planner 可覆盖部分查询、导航和低风险场景 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 框架 | Next.js 15 App Router |
| 语言 | TypeScript |
| UI | Tailwind CSS 4、shadcn/ui、Radix UI、lucide-react、Recharts |
| 数据库 | PostgreSQL、Prisma ORM |
| 认证 | NextAuth.js / Auth.js、Prisma Adapter、bcryptjs |
| AI Provider | Anthropic-compatible messages API、OpenAI-compatible chat completions、DashScope、DeepSeek |
| 地图 | 高德地图 API |
| 微信生态 | 小程序接口、公众号菜单、微信支付预支付与通知接口 |
| 验证 | Zod、ESLint、TypeScript、业务 smoke scripts |

## 角色模型

| 角色 | 典型能力 |
| --- | --- |
| `ADMIN` | 全局经营、商品、订单、客户、经销商、财务、营销、系统设置和日志 |
| `SALESPERSON` | 名下客户、线索、询价、报价、经销商协同、销售业绩 |
| `WAREHOUSE` | 库存、采购、仓库履约、发货、配送相关操作 |
| `FINANCE` | 收款、应收、对账、票据、财务字段可见性 |
| `DEALER` | 经销商接单、拒单、库存上报、推广码和结算摘要 |
| `CONSUMER` | 商城浏览、下单、地址、订单、优惠券和个人资料 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少需要配置：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/huaqi_mall"
AUTH_SECRET="your-secret-key"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

AI provider 可选。未配置真实 key 时，AI 助手中的部分本地规则、固定词条和兜底逻辑仍可用于开发验证。

OpenAI-compatible 示例：

```env
AI_PROVIDER="openai"
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY="your-api-key"
AI_MODEL="gpt-4.1-mini"
```

DeepSeek 示例：

```env
AI_PROVIDER="deepseek"
AI_BASE_URL="https://api.deepseek.com"
AI_API_KEY="your-api-key"
AI_MODEL="deepseek-v4-flash"
AI_THINKING_ENABLED="true"
```

### 3. 初始化数据库

```bash
npx prisma migrate dev
npx prisma db seed
```

### 4. 启动开发服务器

```bash
npm run dev
```

默认访问：

- 首页与商城：`http://localhost:3000`
- 后台入口：`http://localhost:3000/dashboard`
- 经销商端：`http://localhost:3000/dealer`

## 演示账号

`prisma/seed.ts` 会创建以下演示账号：

| 角色 | 登录账号 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin123` |
| 销售员 | `13800138001` | `sales123` |
| 仓管 | `13800138002` | `warehouse123` |
| 财务 | `13800138003` | `finance123` |
| 消费者 | `13900139001` | `customer123` |
| 经销商 | `13900139101` | `dealer123` |

## 常用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run audit:moderate` | 依赖安全审计 |
| `npm run test:ai-tools` | AI tools 权限、规划、确认和兜底 smoke |
| `npm run test:ai-provider` | AI provider 接入 smoke |
| `npm run test:ai-runtime` | AI runtime 回归 |
| `npm run test:agent-capabilities` | Agent 能力目录覆盖检查 |
| `npm run test:rbac` | 角色与路由权限 smoke |
| `npm run test:field-permissions` | 字段级权限 smoke |
| `npm run test:role-acceptance` | 多角色业务验收 smoke |
| `npm run check:system` | 系统完整度矩阵检查 |
| `npm run check:launch` | 上线配置检查 |
| `npm run check:operational` | 运营验收检查 |

## 项目结构

```text
goods_sell/
├── docs/                         # 产品、需求、技术、部署、测试和验收文档
├── prisma/
│   ├── schema.prisma             # 业务数据模型
│   └── seed.ts                   # 演示数据
├── scripts/                      # smoke、验收、上线检查和部署脚本
├── src/
│   ├── app/                      # Next.js App Router 页面与 API
│   ├── components/               # 通用 UI 和布局组件
│   ├── features/
│   │   ├── ai/                   # AI 助手、planner、tools、provider、audit
│   │   ├── auth/                 # 认证、权限、路由守卫
│   │   ├── channel/              # 渠道保护、询价、报价、冲突处理
│   │   ├── dealer/               # 经销商端
│   │   ├── finance/              # 财务与应收
│   │   ├── inventory/            # 库存
│   │   ├── orders/               # 订单与分单
│   │   ├── products/             # 商品、分类、品牌、素材
│   │   ├── shop/                 # 客户商城
│   │   ├── system/               # 上线就绪、系统完整度和运营验收
│   │   └── wechat/               # 微信小程序、公众号和支付
│   └── lib/                      # 环境变量、Prisma、工具函数
└── .env.example                  # 环境变量模板
```

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [项目概述](docs/01-项目概述.md) | 背景、目标、范围 |
| [需求分析](docs/02-需求分析.md) | 功能需求、角色权限、AI tools 需求 |
| [技术方案](docs/03-技术方案.md) | 架构设计、AI tools 执行链路、安全约束 |
| [数据库设计](docs/04-数据库设计.md) | 数据模型与 ER 关系 |
| [功能模块设计](docs/05-功能模块设计.md) | 各业务模块详细设计 |
| [UI 设计规范](docs/06-UI设计规范.md) | 设计系统与交互规范 |
| [API 设计](docs/07-API设计.md) | 接口规范 |
| [部署方案](docs/08-部署方案.md) | 部署与运维 |
| [项目计划](docs/09-项目计划.md) | 阶段计划和完成记录 |
| [图片素材采集辅助工具](docs/10-图片素材采集辅助工具.md) | 商品图片素材授权、导入与存储说明 |
| [产品说明书](docs/11-产品说明书.md) | 产品定位、角色流程和上线准备 |
| [全功能测试方案](docs/12-全功能测试方案.md) | 验收、试运营演练和缺陷记录模板 |
| [AI 工具与代办助手](docs/13-AI工具与代办助手.md) | AI 悬浮气泡、tools、权限、确认和验收 |
| [正式上线验收记录模板](docs/14-正式上线验收记录模板.md) | 上线前业务、技术和合规签收 |
| [系统完整度验收表](docs/15-系统完整度验收表.md) | 程序完整度矩阵 |

## 为什么它适合继续开源化

这个项目的价值不只在酒饮分销行业。它沉淀的是一类更通用的问题：中小企业如何把 AI 助手接入真实业务系统，而不是停留在问答层。

可复用方向包括：

- 将自然语言转换为受控业务操作；
- 用 tool registry 描述 AI 可用能力边界；
- 把权限、参数、确认、审计作为 AI 执行前置条件；
- 为不同角色提供不同的 agent 能力目录；
- 在模型不可用或不确定时降级为可解释的本地规则；
- 用 smoke scripts 验证 AI planner、RBAC、字段权限和上线完整度。

## AI 协作开发说明

本项目由维护者使用 AI 协作完成大量需求拆解、架构设计、代码实现、回归检查和文档整理。项目关注的不是“让 AI 随意写代码”，而是如何把业务问题定义、权限边界、执行约束和测试闭环表达清楚，使 AI 生成的代码能进入可维护的工程系统。

维护者在项目中的主要工作包括：

- 定义真实业务场景和角色边界；
- 拆解模块、数据模型和业务流程；
- 设计 AI tools 的风险分级、确认链路和审计要求；
- 使用 AI 辅助实现功能并持续做人工复核；
- 编写 smoke scripts 验证权限、工具规划、字段隔离和系统完整度；
- 将阶段性结论沉淀为文档，便于后续贡献者理解。

## 路线图

- [x] 增加正式开源许可证文件；
- [ ] 补充截图、演示视频或在线 demo；
- [ ] 增加 Docker Compose，降低 PostgreSQL 本地启动门槛；
- [ ] 拆出更清晰的 AI tool registry 示例文档；
- [ ] 增加英文版 README 和贡献指南；
- [ ] 补充端到端测试和 GitHub Actions CI；
- [ ] 将商品图片、第三方服务和支付能力的 mock 边界进一步文档化。

## 安全与合规提示

- 这是一个业务系统样板，不应直接使用演示密钥、演示账号或 seed 数据进入生产环境。
- 酒类交易、支付、发票、隐私和广告内容需要按部署地区法律法规另行审核。
- 微信支付、地图、税票和商品图片素材依赖第三方授权或真实商户配置。
- AI 工具执行链路已有权限、确认和审计设计，但仍建议在生产前进行独立安全审计。

## 许可证

本项目采用 [MIT License](LICENSE)。
