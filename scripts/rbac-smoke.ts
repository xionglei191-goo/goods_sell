import { dashboardNavItems } from "@/components/layout/dashboard-nav";
import { canAccessPath, filterDashboardNavItems } from "@/features/auth/permissions";
import { registerSchema } from "@/features/auth/schemas";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function titlesFor(role: string) {
  return filterDashboardNavItems(role, dashboardNavItems).map((item) => item.title);
}

function main() {
  assert(!canAccessPath(null, "/dashboard/orders"), "未登录不能访问后台订单");
  assert(canAccessPath("ADMIN", "/dashboard/settings"), "管理员应可访问系统设置");
  assert(!canAccessPath("CONSUMER", "/dashboard"), "消费者不能访问后台");
  assert(!canAccessPath("SALESPERSON", "/dashboard/finance"), "销售员不能访问财务");
  assert(canAccessPath("WAREHOUSE", "/dashboard/inventory"), "仓管应可访问库存");
  assert(canAccessPath("FINANCE", "/dashboard/finance/payments"), "财务应可访问收款");
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
  });
  assert(consumerRegistration.success, "消费者注册表单应通过校验");

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
