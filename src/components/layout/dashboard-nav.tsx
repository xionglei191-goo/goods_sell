import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  Gauge,
  MapPinned,
  Package,
  PackagePlus,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Users,
  Warehouse,
  MessageSquareText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DashboardNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  children?: Array<{
    title: string;
    href: string;
  }>;
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    title: "仪表盘",
    href: "/dashboard",
    icon: Gauge,
  },
  {
    title: "产品管理",
    href: "/dashboard/products",
    icon: Package,
    children: [
      { title: "产品列表", href: "/dashboard/products" },
      { title: "图片素材", href: "/dashboard/products/materials" },
      { title: "分类管理", href: "/dashboard/products/categories" },
      { title: "品牌管理", href: "/dashboard/products/brands" },
    ],
  },
  {
    title: "库存管理",
    href: "/dashboard/inventory",
    icon: Boxes,
    children: [
      { title: "库存总览", href: "/dashboard/inventory" },
      { title: "入库操作", href: "/dashboard/inventory/stock-in" },
      { title: "出库操作", href: "/dashboard/inventory/stock-out" },
      { title: "变动记录", href: "/dashboard/inventory/records" },
    ],
  },
  {
    title: "采购管理",
    href: "/dashboard/purchase",
    icon: PackagePlus,
    children: [
      { title: "采购订单", href: "/dashboard/purchase" },
      { title: "供应商管理", href: "/dashboard/purchase/suppliers" },
    ],
  },
  {
    title: "订单管理",
    href: "/dashboard/orders",
    icon: ShoppingCart,
  },
  {
    title: "客户管理",
    href: "/dashboard/customers",
    icon: Users,
  },
  {
    title: "经销商管理",
    href: "/dashboard/dealers",
    icon: Store,
  },
  {
    title: "销售管理",
    href: "/dashboard/sales",
    icon: BarChart3,
    children: [
      { title: "销售报表", href: "/dashboard/sales" },
      { title: "销售员管理", href: "/dashboard/salespeople" },
    ],
  },
  {
    title: "财务管理",
    href: "/dashboard/finance",
    icon: CreditCard,
    children: [
      { title: "财务总览", href: "/dashboard/finance" },
      { title: "应收账款", href: "/dashboard/finance/receivable" },
      { title: "收款登记", href: "/dashboard/finance/payments" },
      { title: "对账单", href: "/dashboard/finance/statements" },
    ],
  },
  {
    title: "地图管理",
    href: "/dashboard/map",
    icon: MapPinned,
  },
  {
    title: "仓储作业",
    href: "/dashboard/warehouse",
    icon: Warehouse,
  },
  {
    title: "运营营销",
    href: "/dashboard/marketing",
    icon: Tags,
    children: [
      { title: "运营看板", href: "/dashboard/marketing/operations" },
      { title: "优惠券管理", href: "/dashboard/marketing/coupons" },
    ],
  },
  {
    title: "微信生态",
    href: "/dashboard/wechat",
    icon: MessageSquareText,
  },
  {
    title: "物流配送",
    href: "/dashboard/delivery",
    icon: Truck,
  },
  {
    title: "票据记录",
    href: "/dashboard/receipts",
    icon: ReceiptText,
  },
  {
    title: "系统设置",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    title: "操作日志",
    href: "/dashboard/logs",
    icon: ClipboardList,
  },
];

export const breadcrumbLabels: Record<string, string> = {
  dashboard: "仪表盘",
  pending: "待处理事项",
  products: "产品管理",
  materials: "图片素材",
  categories: "分类管理",
  brands: "品牌管理",
  inventory: "库存管理",
  "stock-in": "入库操作",
  "stock-out": "出库操作",
  records: "变动记录",
  purchase: "采购管理",
  suppliers: "供应商管理",
  orders: "订单管理",
  customers: "客户管理",
  dealers: "经销商管理",
  sales: "销售报表",
  salespeople: "销售员管理",
  finance: "财务管理",
  receivable: "应收账款",
  payments: "收款登记",
  statements: "对账单",
  map: "地图管理",
  warehouse: "仓储作业",
  marketing: "运营营销",
  operations: "运营看板",
  coupons: "优惠券管理",
  wechat: "微信生态",
  new: "新建",
  delivery: "物流配送",
  receipts: "票据记录",
  settings: "系统设置",
  users: "用户管理",
  checks: "盘点任务",
  logs: "操作日志",
};
