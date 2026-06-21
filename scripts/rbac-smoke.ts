import { dashboardNavItems } from "@/components/layout/dashboard-nav";
import { appRoles, canAccessPath, filterDashboardNavItems, type AppRole } from "@/features/auth/permissions";
import { registerSchema } from "@/features/auth/schemas";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function titlesFor(role: string) {
  return filterDashboardNavItems(role, dashboardNavItems).map((item) => item.title);
}

type Principal = AppRole | null;

const allPrincipals: Principal[] = [null, ...appRoles];

function assertRouteMatrix(pathname: string, allowed: Principal[], label = pathname) {
  for (const principal of allPrincipals) {
    const actual = canAccessPath(principal, pathname);
    const expected = allowed.includes(principal);
    assert(
      actual === expected,
      `${label}: ${principal ?? "ANONYMOUS"} ${actual ? "可访问" : "不可访问"}，预期 ${expected ? "可访问" : "不可访问"}`,
    );
  }
}

function assertRouteCoverage() {
  const publicPrincipals = allPrincipals;
  const staff: Principal[] = ["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"];
  const adminOnly: Principal[] = ["ADMIN"];
  const salesAndAdmin: Principal[] = ["ADMIN", "SALESPERSON"];
  const salesFinanceAdmin: Principal[] = ["ADMIN", "SALESPERSON", "FINANCE"];
  const warehouseAndAdmin: Principal[] = ["ADMIN", "WAREHOUSE"];
  const mapRoles: Principal[] = ["ADMIN", "SALESPERSON", "WAREHOUSE"];
  const financeAndAdmin: Principal[] = ["ADMIN", "FINANCE"];
  const consumerOnly: Principal[] = ["CONSUMER"];
  const dealerOnly: Principal[] = ["DEALER"];

  [
    "/",
    "/login",
    "/register",
    "/forbidden",
    "/shop",
    "/shop/catalog",
    "/shop/product/demo-product",
    "/shop/scenes/banquet",
    "/shop/scenes/group-buy",
    "/shop/scenes/restock",
    "/shop/channel",
    "/shop/fun",
  ].forEach((route) => assertRouteMatrix(route, publicPrincipals));

  [
    "/shop/cart",
    "/shop/checkout",
    "/shop/checkout/success",
    "/shop/my-orders",
    "/shop/my-orders/demo-order",
    "/shop/account",
    "/shop/account/addresses",
    "/shop/account/profile",
    "/shop/ai-chat",
    "/shop/coupons",
  ].forEach((route) => assertRouteMatrix(route, consumerOnly));

  [
    "/dealer/incoming",
    "/dealer/leads",
    "/dealer/my-orders",
    "/dealer/promotion",
    "/dealer/settlement",
    "/dealer/stock",
  ].forEach((route) => assertRouteMatrix(route, dealerOnly));

  [
    "/dashboard",
    "/dashboard/pending",
    "/dashboard/products",
    "/dashboard/products/demo-product",
    "/dashboard/orders",
    "/dashboard/orders/demo-order",
  ].forEach((route) => assertRouteMatrix(route, staff));

  [
    "/dashboard/products/new",
    "/dashboard/products/categories",
    "/dashboard/products/brands",
    "/dashboard/products/materials",
    "/dashboard/products/demo-product/edit",
    "/dashboard/settings",
    "/dashboard/settings/users",
    "/dashboard/salespeople",
    "/dashboard/wechat",
    "/dashboard/logs",
  ].forEach((route) => assertRouteMatrix(route, adminOnly));

  [
    "/dashboard/leads",
    "/dashboard/inquiries",
    "/dashboard/quotes",
    "/dashboard/promoters",
    "/dashboard/channel-pilot",
    "/dashboard/channel-conflicts",
    "/dashboard/dealers",
    "/dashboard/dealers/demo-dealer/policy",
    "/dashboard/marketing",
    "/dashboard/marketing/operations",
    "/dashboard/marketing/coupons",
    "/dashboard/marketing/coupons/new",
    "/dashboard/product-pushes",
  ].forEach((route) => assertRouteMatrix(route, salesAndAdmin));

  [
    "/dashboard/sales",
    "/dashboard/customers",
    "/dashboard/customers/demo-customer",
  ].forEach((route) => assertRouteMatrix(route, salesFinanceAdmin));

  [
    "/dashboard/inventory",
    "/dashboard/inventory/records",
    "/dashboard/inventory/stock-in",
    "/dashboard/inventory/stock-out",
    "/dashboard/purchase",
    "/dashboard/purchase/suppliers",
    "/dashboard/warehouse",
    "/dashboard/warehouse/checks/demo-check",
    "/dashboard/delivery",
    "/dashboard/delivery/demo-delivery",
  ].forEach((route) => assertRouteMatrix(route, warehouseAndAdmin));

  ["/dashboard/map"].forEach((route) => assertRouteMatrix(route, mapRoles));

  [
    "/dashboard/finance",
    "/dashboard/finance/payments",
    "/dashboard/finance/receivable",
    "/dashboard/finance/statements",
    "/dashboard/receipts",
  ].forEach((route) => assertRouteMatrix(route, financeAndAdmin));
}

function main() {
  assertRouteCoverage();

  assert(!canAccessPath(null, "/dashboard/orders"), "未登录不能访问后台订单");
  assert(canAccessPath("ADMIN", "/dashboard/settings"), "管理员应可访问系统设置");
  assert(!canAccessPath("CONSUMER", "/dashboard"), "消费者不能访问后台");
  assert(!canAccessPath("SALESPERSON", "/dashboard/finance"), "销售员不能访问财务");
  assert(canAccessPath("WAREHOUSE", "/dashboard/inventory"), "仓管应可访问库存");
  assert(!canAccessPath("WAREHOUSE", "/dashboard/salespeople"), "仓管不能访问销售员管理");
  assert(!canAccessPath("WAREHOUSE", "/dashboard/products/example-product/edit"), "仓管不能访问产品编辑页");
  assert(!canAccessPath("FINANCE", "/dashboard/products/example-product/edit"), "财务不能访问产品编辑页");
  assert(!canAccessPath("SALESPERSON", "/dashboard/products/example-product/edit"), "销售员不能访问产品编辑页");
  assert(canAccessPath("ADMIN", "/dashboard/products/example-product/edit"), "管理员应可访问产品编辑页");
  assert(canAccessPath("FINANCE", "/dashboard/finance/payments"), "财务应可访问收款");
  assert(!canAccessPath("FINANCE", "/dashboard/salespeople"), "财务不能访问销售员管理");
  assert(!canAccessPath("SALESPERSON", "/dashboard/salespeople"), "销售员不能维护销售员账号");
  assert(canAccessPath("ADMIN", "/dashboard/salespeople"), "管理员应可访问销售员管理");
  assert(canAccessPath("DEALER", "/dealer/incoming"), "经销商应可访问经销商端");
  assert(!canAccessPath("DEALER", "/shop/cart"), "经销商不能访问消费者购物车");

  const adminTitles = titlesFor("ADMIN");
  const salesTitles = titlesFor("SALESPERSON");
  const warehouseTitles = titlesFor("WAREHOUSE");
  const financeTitles = titlesFor("FINANCE");

  assert(adminTitles.includes("系统设置") && adminTitles.includes("操作日志"), "管理员菜单应包含系统设置和日志");
  assert(salesTitles.includes("渠道经营") && !salesTitles.includes("财务管理"), "销售员菜单应包含渠道经营且不包含财务");
  assert(warehouseTitles.includes("库存管理") && !warehouseTitles.includes("渠道经营"), "仓管菜单应包含库存且不包含渠道经营");
  assert(financeTitles.includes("财务管理") && !financeTitles.includes("仓储作业"), "财务菜单应包含财务且不包含仓储");

  const consumerRegistration = registerSchema.safeParse({
    accountType: "CONSUMER",
    name: "张三",
    phone: "13800138001",
    password: "123456",
    confirmPassword: "123456",
    consentAccepted: true,
  });
  assert(consumerRegistration.success, "消费者注册表单应通过校验");

  const invalidConsumerRegistration = registerSchema.safeParse({
    accountType: "CONSUMER",
    name: "张三",
    phone: "13800138003",
    password: "123456",
    confirmPassword: "123456",
  });
  assert(!invalidConsumerRegistration.success, "消费者未同意协议时注册应失败");

  const dealerRegistration = registerSchema.safeParse({
    accountType: "DEALER",
    name: "李四",
    phone: "13800138002",
    password: "123456",
    confirmPassword: "123456",
    shopName: "雨湖区华启烟酒行",
    zone: "雨湖区",
    address: "湘潭市雨湖区建设北路 1 号",
    consentAccepted: true,
  });
  assert(dealerRegistration.success, "经销商申请表单应通过校验");

  const invalidDealerRegistration = registerSchema.safeParse({
    accountType: "DEALER",
    name: "王五",
    phone: "13800138003",
    password: "123456",
    confirmPassword: "123456",
  });
  assert(!invalidDealerRegistration.success, "缺少门店信息的经销商申请应失败");

  console.log("RBAC smoke passed");
}

main();
