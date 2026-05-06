import { appRoles, canAccessPath, roleHasPermission, type AppRole, type DashboardPermission } from "@/features/auth/permissions";
import type { AiToolContext, AiToolRiskLevel } from "@/features/ai/tools/types";

export type AgentCapabilityKind = "NAVIGATE" | "READ" | "DRAFT" | "WRITE" | "HIGH_RISK";

export type AgentCapability = {
  id: string;
  title: string;
  module: string;
  kind: AgentCapabilityKind;
  href: string;
  paths: readonly string[];
  description: string;
  permission?: DashboardPermission;
  roles?: readonly AppRole[];
  toolName?: string;
  capabilities: readonly string[];
  examples: readonly string[];
  riskLevel: AiToolRiskLevel;
};

export type RankedAgentCapability = {
  capability: AgentCapability;
  score: number;
  reasons: string[];
};

const allRoles = appRoles;

function cap(input: Omit<AgentCapability, "kind" | "riskLevel" | "paths"> & { paths?: readonly string[] }): AgentCapability {
  return {
    kind: "NAVIGATE",
    riskLevel: "READ",
    paths: input.paths ?? [input.href],
    ...input,
  };
}

export const agentCapabilities: readonly AgentCapability[] = [
  cap({
    id: "public.home",
    title: "站点首页",
    module: "公共入口",
    href: "/",
    description: "进入华启商城默认首页。",
    roles: allRoles,
    capabilities: ["首页", "站点入口", "打开首页"],
    examples: ["打开首页"],
  }),
  cap({
    id: "auth.login",
    title: "登录",
    module: "账号",
    href: "/login",
    description: "员工、消费者和经销商登录入口。",
    roles: allRoles,
    capabilities: ["登录", "账号登录", "重新登录"],
    examples: ["登录页面在哪"],
  }),
  cap({
    id: "auth.register",
    title: "注册",
    module: "账号",
    href: "/register",
    description: "消费者注册和经销商入驻申请入口。",
    roles: allRoles,
    capabilities: ["注册", "开户注册", "经销商申请", "消费者注册"],
    examples: ["我要注册经销商"],
  }),
  cap({
    id: "auth.forbidden",
    title: "无权限提示",
    module: "账号",
    href: "/forbidden",
    description: "当前角色无法访问某页面时的提示页。",
    roles: allRoles,
    capabilities: ["无权限", "权限不足", "禁止访问"],
    examples: ["为什么提示无权限"],
  }),
  cap({
    id: "dashboard.home",
    title: "后台仪表盘",
    module: "后台",
    href: "/dashboard",
    description: "查看后台经营指标、待办和关键业务入口。",
    permission: "dashboard:view",
    capabilities: ["后台首页", "仪表盘", "经营看板", "待办"],
    examples: ["打开后台仪表盘"],
  }),
  cap({
    id: "products.list",
    title: "产品管理",
    module: "产品",
    href: "/dashboard/products",
    paths: ["/dashboard/products", "/dashboard/products/[id]"],
    description: "查看商品列表、价格、库存、上下架状态和商品详情。",
    permission: "products:view",
    toolName: "search_products",
    capabilities: ["产品管理", "商品管理", "商品列表", "商品详情", "查商品", "价格库存"],
    examples: ["产品管理在哪", "查看商品详情"],
  }),
  cap({
    id: "products.create",
    title: "新增商品",
    module: "产品",
    href: "/dashboard/products/new",
    description: "创建商品资料，维护 SKU、规格、价格和基础信息。",
    permission: "products:write",
    toolName: "admin_create_product_draft",
    capabilities: ["新增商品", "创建商品", "商品草稿", "录入 SKU"],
    examples: ["新增商品页面在哪"],
  }),
  cap({
    id: "products.edit",
    title: "编辑商品",
    module: "产品",
    href: "/dashboard/products",
    paths: ["/dashboard/products/[id]/edit"],
    description: "编辑已有商品资料、价格、规格和上下架信息。",
    permission: "products:write",
    capabilities: ["编辑商品", "修改商品", "调整商品资料"],
    examples: ["商品编辑入口在哪"],
  }),
  cap({
    id: "products.categories",
    title: "产品分类",
    module: "产品",
    href: "/dashboard/products/categories",
    description: "维护商品分类和前台分类导航。",
    permission: "products:write",
    toolName: "product_catalog_summary",
    capabilities: ["商品分类", "产品分类", "分类管理"],
    examples: ["产品分类在哪管理"],
  }),
  cap({
    id: "products.brands",
    title: "产品品牌",
    module: "产品",
    href: "/dashboard/products/brands",
    description: "维护品牌资料、品牌状态和品牌展示信息。",
    permission: "products:write",
    toolName: "product_catalog_summary",
    capabilities: ["品牌管理", "产品品牌", "品牌资料"],
    examples: ["品牌管理在哪"],
  }),
  cap({
    id: "products.materials",
    title: "商品图片素材",
    module: "产品",
    href: "/dashboard/products/materials",
    description: "管理商品图片、素材库和商品展示素材。",
    permission: "products:write",
    toolName: "product_catalog_summary",
    capabilities: ["商品图片", "素材库", "图片素材", "产品素材"],
    examples: ["商品图片素材在哪"],
  }),
  cap({
    id: "inventory.summary",
    title: "库存管理",
    module: "库存",
    href: "/dashboard/inventory",
    description: "查看库存总览、库存预警和库存管理入口。",
    permission: "inventory:manage",
    toolName: "product_operations_summary",
    capabilities: ["库存管理", "库存总览", "库存预警", "库存查询"],
    examples: ["怎么查看库存"],
  }),
  cap({
    id: "inventory.records",
    title: "库存流水",
    module: "库存",
    href: "/dashboard/inventory/records",
    description: "查看商品入库、出库和库存调整流水。",
    permission: "inventory:manage",
    toolName: "inventory_records_summary",
    capabilities: ["库存流水", "出入库记录", "库存记录", "库存明细"],
    examples: ["怎么查看库存流水"],
  }),
  cap({
    id: "inventory.stock_in",
    title: "商品入库",
    module: "库存",
    href: "/dashboard/inventory/stock-in",
    description: "办理商品入库，增加库存并记录入库流水。",
    permission: "inventory:manage",
    toolName: "inventory_stock_in",
    capabilities: ["入库", "商品入库", "库存增加", "采购入库"],
    examples: ["入库页面在哪"],
  }),
  cap({
    id: "inventory.stock_out",
    title: "商品出库",
    module: "库存",
    href: "/dashboard/inventory/stock-out",
    description: "办理商品出库，减少库存并记录出库流水。",
    permission: "inventory:manage",
    toolName: "inventory_stock_out",
    capabilities: ["出库", "商品出库", "库存减少"],
    examples: ["出库页面在哪"],
  }),
  cap({
    id: "purchase.orders",
    title: "采购管理",
    module: "采购",
    href: "/dashboard/purchase",
    description: "管理采购计划、采购单和采购到货状态。",
    permission: "purchase:manage",
    toolName: "purchase_supplier_summary",
    capabilities: ["采购管理", "采购单", "采购计划", "进货"],
    examples: ["采购单在哪看"],
  }),
  cap({
    id: "purchase.suppliers",
    title: "供应商管理",
    module: "采购",
    href: "/dashboard/purchase/suppliers",
    description: "维护供应商档案、联系方式和供货关系。",
    permission: "purchase:manage",
    toolName: "purchase_supplier_summary",
    capabilities: ["供应商", "供应商管理", "供货商", "供应商档案"],
    examples: ["供应商管理在哪"],
  }),
  cap({
    id: "orders.list",
    title: "订单管理",
    module: "订单",
    href: "/dashboard/orders",
    paths: ["/dashboard/orders", "/dashboard/orders/[id]"],
    description: "查看后台订单、订单状态、客户和金额信息。",
    permission: "orders:view",
    capabilities: ["订单管理", "订单列表", "订单详情", "查订单"],
    examples: ["订单管理在哪"],
  }),
  cap({
    id: "orders.create",
    title: "后台开单",
    module: "订单",
    href: "/dashboard/orders/new",
    description: "由后台员工为客户创建订单草稿和开单。",
    permission: "orders:write",
    toolName: "orders_manual_order_draft",
    capabilities: ["后台开单", "新增订单", "帮客户下单", "手工开单"],
    examples: ["帮客户开单入口在哪"],
  }),
  cap({
    id: "customers.list",
    title: "客户管理",
    module: "客户",
    href: "/dashboard/customers",
    paths: ["/dashboard/customers", "/dashboard/customers/[id]"],
    description: "查看客户档案、归属销售员、欠款、标签和近期订单。",
    permission: "customers:view",
    toolName: "search_customers",
    capabilities: ["客户管理", "客户档案", "客户详情", "客户查询", "客户欠款"],
    examples: ["客户管理在哪", "查客户资料"],
  }),
  cap({
    id: "dealers.list",
    title: "经销商管理",
    module: "经销商",
    href: "/dashboard/dealers",
    description: "查看经销商档案、服务范围、状态和渠道协作信息。",
    permission: "dealers:view",
    capabilities: ["经销商管理", "经销商档案", "经销商审核", "服务范围"],
    examples: ["经销商管理在哪"],
  }),
  cap({
    id: "dealers.policy",
    title: "经销商政策",
    module: "经销商",
    href: "/dashboard/dealers",
    paths: ["/dashboard/dealers/[id]/policy"],
    description: "维护经销商折扣、拒单限制、服务半径和分佣政策。",
    permission: "dealers:view",
    toolName: "admin_update_dealer_policy",
    capabilities: ["经销商政策", "折扣政策", "服务半径", "分佣政策", "拒单限制"],
    examples: ["帮我打开经销商政策"],
  }),
  cap({
    id: "channel.leads",
    title: "线索管理",
    module: "渠道",
    href: "/dashboard/leads",
    description: "管理渠道线索、经销商入驻线索和线索跟进状态。",
    permission: "channel:manage",
    toolName: "channel_pipeline_summary",
    capabilities: ["线索管理", "渠道线索", "入驻线索", "线索跟进"],
    examples: ["线索页在哪"],
  }),
  cap({
    id: "channel.inquiries",
    title: "询价管理",
    module: "渠道",
    href: "/dashboard/inquiries",
    description: "查看大单询价、客户需求和报价前信息。",
    permission: "channel:manage",
    toolName: "channel_pipeline_summary",
    capabilities: ["询价管理", "大单询价", "询价单"],
    examples: ["询价单在哪看"],
  }),
  cap({
    id: "channel.quotes",
    title: "报价管理",
    module: "渠道",
    href: "/dashboard/quotes",
    description: "管理报价单、报价状态和报价转化。",
    permission: "channel:manage",
    toolName: "channel_pipeline_summary",
    capabilities: ["报价管理", "报价单", "报价转化"],
    examples: ["报价管理在哪"],
  }),
  cap({
    id: "channel.promoters",
    title: "推广员管理",
    module: "渠道",
    href: "/dashboard/promoters",
    description: "维护推广员、推广码和推广归因。",
    permission: "channel:manage",
    toolName: "channel_pipeline_summary",
    capabilities: ["推广员", "推广码", "渠道推广", "推广归因"],
    examples: ["推广员在哪管理"],
  }),
  cap({
    id: "channel.pilot",
    title: "渠道试点",
    module: "渠道",
    href: "/dashboard/channel-pilot",
    description: "查看渠道试点配置、试点效果和渠道实验数据。",
    permission: "channel:manage",
    toolName: "channel_pipeline_summary",
    capabilities: ["渠道试点", "试点配置", "渠道实验"],
    examples: ["渠道试点在哪"],
  }),
  cap({
    id: "channel.conflicts",
    title: "渠道冲突",
    module: "渠道",
    href: "/dashboard/channel-conflicts",
    description: "查看未关闭渠道冲突、归因冲突和处理状态。",
    permission: "channel:manage",
    toolName: "channel_summary",
    capabilities: ["渠道冲突", "冲突处理", "渠道归因冲突"],
    examples: ["最近渠道冲突在哪看"],
  }),
  cap({
    id: "sales.reports",
    title: "销售报表",
    module: "销售",
    href: "/dashboard/sales",
    description: "查看销售额、订单数、回款、销售员业绩和转化指标。",
    permission: "sales:view",
    toolName: "salesperson_performance",
    capabilities: ["销售报表", "销售业绩", "销售员绩效", "转化率"],
    examples: ["销售报表在哪"],
  }),
  cap({
    id: "sales.salespeople",
    title: "销售员管理",
    module: "销售",
    href: "/dashboard/salespeople",
    description: "维护销售员账号、启停状态和绩效看板。",
    permission: "settings:manage",
    capabilities: ["销售员管理", "业务员管理", "销售账号"],
    examples: ["销售员管理在哪"],
  }),
  cap({
    id: "finance.summary",
    title: "财务管理",
    module: "财务",
    href: "/dashboard/finance",
    description: "查看应收、回款、毛利和财务待办。",
    permission: "finance:manage",
    toolName: "finance_summary",
    capabilities: ["财务管理", "财务摘要", "应收", "回款", "毛利"],
    examples: ["财务管理在哪"],
  }),
  cap({
    id: "finance.payments",
    title: "收款记录",
    module: "财务",
    href: "/dashboard/finance/payments",
    description: "查看客户收款、支付方式和核销记录。",
    permission: "finance:manage",
    toolName: "finance_register_payment",
    capabilities: ["收款记录", "回款记录", "收款核销", "付款记录"],
    examples: ["收款记录在哪看"],
  }),
  cap({
    id: "finance.receivable",
    title: "应收账款",
    module: "财务",
    href: "/dashboard/finance/receivable",
    description: "查看客户欠款、应收账款、账龄和催收信息。",
    permission: "finance:manage",
    toolName: "finance_summary",
    capabilities: ["应收账款", "客户欠款", "账龄", "欠款排行"],
    examples: ["客户欠款在哪看"],
  }),
  cap({
    id: "finance.statements",
    title: "财务对账单",
    module: "财务",
    href: "/dashboard/finance/statements",
    description: "生成和查看客户对账单、账期和结算明细。",
    permission: "finance:manage",
    toolName: "finance_statement_summary",
    capabilities: ["对账单", "客户对账", "财务报表", "结算明细"],
    examples: ["对账单在哪"],
  }),
  cap({
    id: "receipts.list",
    title: "票据记录",
    module: "财务",
    href: "/dashboard/receipts",
    description: "管理发票、票据状态和开票记录。",
    permission: "receipts:manage",
    toolName: "receipts_issue_invoice",
    capabilities: ["票据", "发票", "开票记录", "票据记录"],
    examples: ["发票记录在哪"],
  }),
  cap({
    id: "warehouse.summary",
    title: "仓储作业",
    module: "仓储",
    href: "/dashboard/warehouse",
    description: "查看仓储任务、盘点、履约和仓库作业状态。",
    permission: "warehouse:manage",
    toolName: "warehouse_create_stock_check",
    capabilities: ["仓储作业", "仓库作业", "盘点", "履约"],
    examples: ["仓储作业在哪"],
  }),
  cap({
    id: "warehouse.check_detail",
    title: "盘点详情",
    module: "仓储",
    href: "/dashboard/warehouse",
    paths: ["/dashboard/warehouse/checks/[id]"],
    description: "查看盘点任务详情、盘点差异和处理结果。",
    permission: "warehouse:manage",
    capabilities: ["盘点详情", "盘点任务", "库存盘点"],
    examples: ["盘点任务详情在哪"],
  }),
  cap({
    id: "delivery.list",
    title: "物流配送",
    module: "配送",
    href: "/dashboard/delivery",
    paths: ["/dashboard/delivery", "/dashboard/delivery/[id]"],
    description: "查看配送单、配送状态、异常和送达记录。",
    permission: "delivery:manage",
    toolName: "delivery_summary",
    capabilities: ["物流配送", "配送管理", "待发货", "配送异常", "配送详情"],
    examples: ["物流配送在哪"],
  }),
  cap({
    id: "marketing.home",
    title: "运营营销",
    module: "营销",
    href: "/dashboard/marketing",
    description: "查看营销活动、优惠券、新品推送和运营数据入口。",
    permission: "marketing:manage",
    capabilities: ["运营营销", "营销活动", "营销管理"],
    examples: ["运营营销在哪"],
  }),
  cap({
    id: "marketing.coupons",
    title: "优惠券管理",
    module: "营销",
    href: "/dashboard/marketing/coupons",
    paths: ["/dashboard/marketing/coupons", "/dashboard/marketing/coupons/new"],
    description: "创建和管理优惠券活动、发券规则和发放状态。",
    permission: "marketing:manage",
    toolName: "marketing_create_coupon",
    capabilities: ["优惠券", "发券", "券活动", "优惠券管理"],
    examples: ["优惠券在哪管理"],
  }),
  cap({
    id: "marketing.operations",
    title: "运营活动",
    module: "营销",
    href: "/dashboard/marketing/operations",
    description: "查看运营活动、营销策略和活动效果。",
    permission: "marketing:manage",
    capabilities: ["运营活动", "活动效果", "营销策略"],
    examples: ["运营活动在哪"],
  }),
  cap({
    id: "marketing.product_pushes",
    title: "新品推送",
    module: "营销",
    href: "/dashboard/product-pushes",
    description: "管理新品推送任务、目标人群和推送效果。",
    permission: "marketing:manage",
    toolName: "marketing_create_product_push",
    capabilities: ["新品推送", "产品推送", "推送任务"],
    examples: ["新品推送在哪"],
  }),
  cap({
    id: "map.service",
    title: "地图管理",
    module: "地图",
    href: "/dashboard/map",
    description: "查看客户、经销商和配送相关的地图位置。",
    roles: ["ADMIN", "SALESPERSON", "WAREHOUSE"],
    capabilities: ["地图", "客户地图", "经销商地图", "配送地图"],
    examples: ["地图管理在哪"],
  }),
  cap({
    id: "pending.tasks",
    title: "待办中心",
    module: "后台",
    href: "/dashboard/pending",
    description: "查看当前角色可处理的业务待办。",
    permission: "dashboard:view",
    capabilities: ["待办", "待处理", "任务中心", "待办中心"],
    examples: ["待办中心在哪"],
  }),
  cap({
    id: "wechat.settings",
    title: "微信生态",
    module: "微信",
    href: "/dashboard/wechat",
    description: "配置公众号菜单、模板消息、小程序和微信相关能力。",
    permission: "wechat:manage",
    toolName: "wechat_ecosystem_summary",
    capabilities: ["微信生态", "公众号菜单", "微信菜单", "小程序", "模板消息"],
    examples: ["微信菜单在哪配置"],
  }),
  cap({
    id: "settings.home",
    title: "系统设置",
    module: "系统",
    href: "/dashboard/settings",
    description: "管理业务参数、系统配置和基础设置。",
    permission: "settings:manage",
    toolName: "settings_save_business_config",
    capabilities: ["系统设置", "业务配置", "基础设置", "参数配置"],
    examples: ["系统设置在哪"],
  }),
  cap({
    id: "settings.users",
    title: "用户管理",
    module: "系统",
    href: "/dashboard/settings/users",
    description: "管理员工账号、角色、启停状态和密码重置。",
    permission: "settings:manage",
    toolName: "settings_create_staff_user",
    capabilities: ["用户管理", "员工账号", "角色权限", "重置密码", "禁用员工"],
    examples: ["用户管理在哪"],
  }),
  cap({
    id: "logs.audit",
    title: "操作日志",
    module: "系统",
    href: "/dashboard/logs",
    description: "查看系统操作日志、AI 审计和关键业务变更记录。",
    permission: "logs:manage",
    toolName: "audit_log_summary",
    capabilities: ["操作日志", "审计日志", "AI 日志", "业务日志"],
    examples: ["操作日志在哪"],
  }),
  cap({
    id: "dealer.incoming",
    title: "经销商待接订单",
    module: "经销商端",
    href: "/dealer/incoming",
    description: "经销商查看并处理待接订单。",
    roles: ["DEALER"],
    toolName: "dealer_incoming_orders",
    capabilities: ["待接订单", "经销商接单", "新订单", "接单"],
    examples: ["经销商待接订单在哪"],
  }),
  cap({
    id: "dealer.leads",
    title: "经销商线索",
    module: "经销商端",
    href: "/dealer/leads",
    description: "经销商查看自己的推广线索和线索转化。",
    roles: ["DEALER"],
    toolName: "dealer_promotion_summary",
    capabilities: ["经销商线索", "我的线索", "推广线索"],
    examples: ["我的经销商线索在哪"],
  }),
  cap({
    id: "dealer.orders",
    title: "经销商订单",
    module: "经销商端",
    href: "/dealer/my-orders",
    description: "经销商查看自己承接的订单和履约状态。",
    roles: ["DEALER"],
    capabilities: ["经销商订单", "我的订单", "履约订单"],
    examples: ["我的经销商订单在哪"],
  }),
  cap({
    id: "dealer.promotion",
    title: "经销商推广",
    module: "经销商端",
    href: "/dealer/promotion",
    description: "经销商查看推广码、推广链接和推广效果。",
    roles: ["DEALER"],
    toolName: "dealer_promotion_summary",
    capabilities: ["经销商推广", "推广码", "推广链接", "推广效果"],
    examples: ["我的推广码在哪"],
  }),
  cap({
    id: "dealer.settlement",
    title: "经销商结算",
    module: "经销商端",
    href: "/dealer/settlement",
    description: "经销商查看佣金、结算和账款信息。",
    roles: ["DEALER"],
    toolName: "dealer_settlement_summary",
    capabilities: ["经销商结算", "佣金", "结算账款"],
    examples: ["经销商结算在哪"],
  }),
  cap({
    id: "dealer.stock",
    title: "经销商库存",
    module: "经销商端",
    href: "/dealer/stock",
    description: "经销商上报和查看自己的门店库存。",
    roles: ["DEALER"],
    toolName: "dealer_report_stock",
    capabilities: ["经销商库存", "门店库存", "上报库存"],
    examples: ["门店库存在哪上报"],
  }),
  cap({
    id: "shop.home",
    title: "商城首页",
    module: "商城",
    href: "/shop",
    description: "消费者商城首页，包含商品推荐、活动和入口。",
    capabilities: ["商城首页", "买酒首页", "消费者首页"],
    examples: ["打开商城"],
  }),
  cap({
    id: "shop.catalog",
    title: "商品目录",
    module: "商城",
    href: "/shop/catalog",
    paths: ["/shop/catalog", "/shop/product/[id]"],
    description: "消费者浏览商品目录和商品详情。",
    toolName: "search_products",
    capabilities: ["商品目录", "商品详情", "浏览商品", "商品分类"],
    examples: ["商品目录在哪"],
  }),
  cap({
    id: "shop.cart",
    title: "购物车",
    module: "商城",
    href: "/shop/cart",
    description: "消费者查看购物车、调整数量并进入结算。",
    roles: ["CONSUMER"],
    toolName: "shop_cart_summary",
    capabilities: ["购物车", "我的购物车", "结算商品"],
    examples: ["查购物车"],
  }),
  cap({
    id: "shop.checkout",
    title: "订单结算",
    module: "商城",
    href: "/shop/checkout",
    paths: ["/shop/checkout", "/shop/checkout/success"],
    description: "消费者确认地址、优惠和支付方式后提交订单。",
    roles: ["CONSUMER"],
    capabilities: ["结算", "提交订单", "支付", "下单成功"],
    examples: ["去结算"],
  }),
  cap({
    id: "shop.orders",
    title: "我的订单",
    module: "商城",
    href: "/shop/my-orders",
    paths: ["/shop/my-orders", "/shop/my-orders/[id]"],
    description: "消费者查看自己的订单列表、订单详情和配送状态。",
    roles: ["CONSUMER"],
    toolName: "customer_orders",
    capabilities: ["我的订单", "订单详情", "配送状态", "购买记录"],
    examples: ["我的订单在哪"],
  }),
  cap({
    id: "shop.account",
    title: "账户中心",
    module: "商城",
    href: "/shop/account",
    description: "消费者查看账户资料、地址和个人信息入口。",
    roles: ["CONSUMER"],
    toolName: "shop_account_summary",
    capabilities: ["账户中心", "我的账户", "个人中心"],
    examples: ["账户中心在哪"],
  }),
  cap({
    id: "shop.addresses",
    title: "收货地址",
    module: "商城",
    href: "/shop/account/addresses",
    description: "消费者维护收货地址和默认地址。",
    roles: ["CONSUMER"],
    toolName: "shop_account_summary",
    capabilities: ["收货地址", "地址管理", "默认地址"],
    examples: ["收货地址在哪改"],
  }),
  cap({
    id: "shop.profile",
    title: "个人资料",
    module: "商城",
    href: "/shop/account/profile",
    description: "消费者维护昵称、手机号等个人资料。",
    roles: ["CONSUMER"],
    toolName: "shop_account_summary",
    capabilities: ["个人资料", "修改资料", "账号资料"],
    examples: ["个人资料在哪"],
  }),
  cap({
    id: "shop.ai_chat",
    title: "商城 AI 对话",
    module: "商城",
    href: "/shop/ai-chat",
    description: "消费者进入商城 AI 对话和推荐助手。",
    roles: ["CONSUMER"],
    capabilities: ["AI 对话", "商城助手", "AI 推荐"],
    examples: ["商城 AI 对话在哪"],
  }),
  cap({
    id: "shop.coupons",
    title: "我的优惠券",
    module: "商城",
    href: "/shop/coupons",
    description: "消费者查看可用优惠券、已用券和过期券。",
    roles: ["CONSUMER"],
    toolName: "shop_coupon_summary",
    capabilities: ["我的优惠券", "优惠券", "可用券"],
    examples: ["我的优惠券在哪"],
  }),
  cap({
    id: "shop.channel",
    title: "渠道活动",
    module: "商城",
    href: "/shop/channel",
    description: "消费者查看渠道活动、推广活动和合作入口。",
    capabilities: ["渠道活动", "推广活动", "渠道入口"],
    examples: ["渠道活动在哪"],
  }),
  cap({
    id: "shop.fun",
    title: "AI 趣味互动",
    module: "商城",
    href: "/shop/fun",
    description: "消费者参与 AI 趣味互动和轻量营销玩法。",
    capabilities: ["AI 趣味互动", "互动玩法", "商城互动"],
    examples: ["AI 趣味互动在哪"],
  }),
  cap({
    id: "shop.scene_banquet",
    title: "宴席场景",
    module: "商城",
    href: "/shop/scenes/banquet",
    description: "消费者按宴席场景选购商品。",
    capabilities: ["宴席", "宴会用酒", "场景购酒"],
    examples: ["宴席用酒在哪看"],
  }),
  cap({
    id: "shop.scene_group_buy",
    title: "团购场景",
    module: "商城",
    href: "/shop/scenes/group-buy",
    description: "消费者按团购场景查看商品和活动。",
    capabilities: ["团购", "团购活动", "多人购买"],
    examples: ["团购入口在哪"],
  }),
  cap({
    id: "shop.scene_restock",
    title: "补货场景",
    module: "商城",
    href: "/shop/scenes/restock",
    description: "消费者按补货场景快速复购和下单。",
    capabilities: ["补货", "复购", "快速补货"],
    examples: ["补货入口在哪"],
  }),
];

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function splitSearchTerms(message: string) {
  const directTerms = message.split(/[\s，。,.！!？?、:：/\\|]+/).filter(Boolean);
  const alphaTerms = Array.from(message.matchAll(/[A-Za-z0-9-]{3,}/g)).map((match) => match[0]);
  const cjkTerms = Array.from(message.matchAll(/[\u4e00-\u9fa5]{2,6}/g)).map((match) => match[0]);
  return Array.from(new Set([...directTerms, ...alphaTerms, ...cjkTerms])).filter((term) => term.length >= 2);
}

function scorePhrase(message: string, phrase: string) {
  const normalizedMessage = normalize(message);
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return 0;
  if (normalizedMessage.includes(normalizedPhrase)) return normalizedPhrase.length >= 4 ? 14 : 9;
  if (normalizedPhrase.includes(normalizedMessage) && normalizedMessage.length >= 4) return 7;
  return 0;
}

export function canUseAgentCapability(context: AiToolContext, capability: AgentCapability) {
  if (capability.roles && !capability.roles.includes(context.role)) return false;
  if (capability.permission && !roleHasPermission(context.role, capability.permission)) return false;
  return capability.paths.some((path) => canAccessPath(context.role, path));
}

export function findAgentCapabilityById(id: string) {
  return agentCapabilities.find((capability) => capability.id === id) ?? null;
}

function scoreCapability(message: string, capability: AgentCapability, index: number): RankedAgentCapability {
  const terms = splitSearchTerms(message);
  const reasons: string[] = [];
  let score = Math.max(0, 1 - index / 1000);

  for (const phrase of [capability.title, capability.module, capability.description, capability.href, ...(capability.capabilities ?? []), ...(capability.examples ?? [])]) {
    const value = scorePhrase(message, phrase);
    if (value > 0) {
      score += value;
      if (reasons.length < 4) reasons.push(`${phrase}`);
    }
  }

  const semanticText = normalize([capability.id, capability.title, capability.module, capability.description, capability.href, ...capability.capabilities, ...capability.examples].join(" "));
  for (const term of terms) {
    const normalizedTerm = normalize(term);
    if (normalizedTerm && semanticText.includes(normalizedTerm)) {
      score += normalizedTerm.length >= 4 ? 3 : 1.5;
      if (reasons.length < 4) reasons.push(term);
    }
  }

  if (/在哪|哪里|入口|打开|进入|跳转|页面|功能|菜单|怎么|如何|查看|配置|管理/.test(message)) score += 4;
  if (capability.kind === "NAVIGATE") score += 0.3;

  return { capability, score, reasons: reasons.slice(0, 4) };
}

export function rankAgentCapabilitiesForMessage(message: string, context: AiToolContext, options: { includeInaccessible?: boolean } = {}) {
  return agentCapabilities
    .map((capability, index) => scoreCapability(message, capability, index))
    .filter((item) => options.includeInaccessible || canUseAgentCapability(context, item.capability))
    .sort((left, right) => right.score - left.score);
}

export function describeAgentCapability(capability: AgentCapability) {
  return `${capability.title}（${capability.module}）：${capability.description}`;
}

export function describeRankedAgentCapabilitiesForPrompt(rankedCapabilities: readonly RankedAgentCapability[], limit = 8) {
  return rankedCapabilities
    .slice(0, limit)
    .map((item) => {
      const cap = item.capability;
      const toolText = cap.toolName ? `；关联工具=${cap.toolName}` : "";
      return `- ${cap.id}｜${cap.title}｜${cap.kind}｜${cap.href}｜${cap.description}｜关键词=${cap.capabilities.join("、")}｜示例=${cap.examples.join(" / ")}${toolText}`;
    })
    .join("\n");
}

export function findBestAgentCapabilityForMessage(message: string, context: AiToolContext, threshold = 8) {
  const [best] = rankAgentCapabilitiesForMessage(message, context);
  return best && best.score >= threshold ? best : null;
}

export function buildAgentCapabilityDetails(capability: AgentCapability) {
  return [
    { label: "模块", value: capability.module },
    { label: "入口", value: capability.href },
    { label: "能力等级", value: capability.kind },
    ...(capability.permission ? [{ label: "所需权限", value: capability.permission }] : []),
    ...(capability.toolName ? [{ label: "关联工具", value: capability.toolName }] : []),
  ];
}
