import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SystemCompletenessSeverity = "BLOCKER" | "WARNING" | "TODO" | "READY";
export type SystemCompletenessArea =
  | "后台"
  | "商城"
  | "经销商"
  | "AI"
  | "权限"
  | "订单"
  | "库存"
  | "财务"
  | "营销"
  | "微信生态"
  | "日志"
  | "配置中心"
  | "报表"
  | "地图配送";

export type SystemCompletenessDimension = "真实入口" | "真实操作" | "权限" | "审计" | "异常处理" | "验证";

export type SystemCompletenessItem = {
  key: string;
  area: SystemCompletenessArea;
  dimension: SystemCompletenessDimension;
  label: string;
  severity: SystemCompletenessSeverity;
  summary: string;
  evidence: string[];
  action: string;
  href?: string;
};

export type SystemCompletenessModule = {
  key: string;
  area: SystemCompletenessArea;
  label: string;
  status: SystemCompletenessSeverity;
  summary: string;
  items: SystemCompletenessItem[];
};

export type SystemCompletenessReport = {
  checkedAt: string;
  status: SystemCompletenessSeverity;
  readyCount: number;
  todoCount: number;
  warningCount: number;
  blockerCount: number;
  modules: SystemCompletenessModule[];
  items: SystemCompletenessItem[];
};

type Criterion = {
  dimension: SystemCompletenessDimension;
  ready: boolean;
  evidence: string[];
  summary: string;
  action: string;
  href?: string;
  severityWhenMissing?: SystemCompletenessSeverity;
};

type ModuleSpec = {
  key: string;
  area: SystemCompletenessArea;
  label: string;
  entry: Criterion;
  operation: Criterion;
  permission: Criterion;
  audit: Criterion;
  exception: Criterion;
  verification: Criterion;
};

function has(path: string) {
  return existsSync(join(process.cwd(), path));
}

function read(path: string) {
  const fullPath = join(process.cwd(), path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function includes(path: string, needle: string | RegExp) {
  const source = read(path);
  return typeof needle === "string" ? source.includes(needle) : needle.test(source);
}

function includesAll(path: string, needles: Array<string | RegExp>) {
  return needles.every((needle) => includes(path, needle));
}

function includesAny(path: string, needles: Array<string | RegExp>) {
  return needles.some((needle) => includes(path, needle));
}

function packageHasScript(scriptName: string) {
  return includes("package.json", new RegExp(`"${scriptName}"\\s*:`));
}

function all(paths: string[]) {
  return paths.every(has);
}

function hasActionQuality(path: string, operations: Array<string | RegExp>) {
  return has(path) && includesAll(path, operations) && includesAny(path, ["try {", "catch (error)", "return { success: false", "NextResponse.json"]);
}

function hasAudit(path: string) {
  return has(path) && includes(path, "logAction");
}

function item(module: Pick<ModuleSpec, "key" | "area">, criterion: Criterion): SystemCompletenessItem {
  const severity = criterion.ready ? "READY" : (criterion.severityWhenMissing ?? (criterion.dimension === "真实入口" || criterion.dimension === "真实操作" || criterion.dimension === "权限" ? "BLOCKER" : "WARNING"));
  return {
    key: `${module.key}_${dimensionKey(criterion.dimension)}`,
    area: module.area,
    dimension: criterion.dimension,
    label: criterion.dimension,
    severity,
    summary: criterion.summary,
    evidence: criterion.evidence,
    action: criterion.ready ? "无需处理" : criterion.action,
    href: criterion.href,
  };
}

function dimensionKey(dimension: SystemCompletenessDimension) {
  return (
    {
      真实入口: "entry",
      真实操作: "operation",
      权限: "permission",
      审计: "audit",
      异常处理: "exception",
      验证: "verification",
    } satisfies Record<SystemCompletenessDimension, string>
  )[dimension];
}

function statusRank(status: SystemCompletenessSeverity) {
  return status === "BLOCKER" ? 4 : status === "WARNING" ? 3 : status === "TODO" ? 2 : 1;
}

function moduleStatus(items: SystemCompletenessItem[]) {
  return items.reduce<SystemCompletenessSeverity>((current, next) => (statusRank(next.severity) > statusRank(current) ? next.severity : current), "READY");
}

function moduleSummary(status: SystemCompletenessSeverity) {
  if (status === "READY") return "真实入口、真实操作、权限、审计、异常处理和验证证据均已具备。";
  if (status === "TODO") return "功能主体可用，但仍有非阻塞完善项。";
  if (status === "WARNING") return "程序主体可用，但存在需要补强的审计、异常处理或验证证据。";
  return "存在程序本体关键缺口，不能用外部配置或运营签收解释。";
}

export function getSystemCompletenessReport(): SystemCompletenessReport {
  const specs: ModuleSpec[] = [
    {
      key: "dashboard",
      area: "后台",
      label: "后台经营台",
      entry: {
        dimension: "真实入口",
        ready: all([
          "src/app/(dashboard)/dashboard/page.tsx",
          "src/app/(dashboard)/dashboard/products/page.tsx",
          "src/app/(dashboard)/dashboard/orders/page.tsx",
          "src/app/(dashboard)/dashboard/customers/page.tsx",
          "src/app/(dashboard)/dashboard/inventory/page.tsx",
          "src/app/(dashboard)/dashboard/finance/page.tsx",
        ]),
        summary: "后台必须有经营首页、商品、订单、客户、库存、财务等可访问入口。",
        evidence: ["src/app/(dashboard)/dashboard/**"],
        action: "补齐后台缺失页面和导航入口。",
        href: "/dashboard",
      },
      operation: {
        dimension: "真实操作",
        ready: all(["src/features/products/actions.ts", "src/features/orders/actions.ts", "src/features/inventory/actions.ts", "src/features/finance/actions.ts"]),
        summary: "后台核心模块必须有真实 server action 支撑，不应只是只读页面。",
        evidence: ["src/features/products/actions.ts", "src/features/orders/actions.ts", "src/features/inventory/actions.ts", "src/features/finance/actions.ts"],
        action: "补齐商品、订单、库存、财务的真实写操作。",
      },
      permission: {
        dimension: "权限",
        ready: has("src/features/auth/permissions.ts") && includesAll("src/features/auth/permissions.ts", ["dashboardRouteRules", "permissionRoles", "/dashboard"]),
        summary: "后台路由必须进入统一权限矩阵，不能只靠前端隐藏菜单。",
        evidence: ["src/features/auth/permissions.ts"],
        action: "补齐后台路由权限矩阵和越权拦截。",
      },
      audit: {
        dimension: "审计",
        ready: ["src/features/products/actions.ts", "src/features/orders/actions.ts", "src/features/inventory/actions.ts", "src/features/finance/actions.ts"].some(hasAudit),
        summary: "后台核心写操作应写入操作日志，方便追溯敏感变更。",
        evidence: ["src/features/logs/audit.ts", "src/features/*/actions.ts"],
        action: "为后台核心写操作补齐 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: has("src/app/(dashboard)/dashboard/error.tsx") && includesAny("src/features/orders/actions.ts", ["catch (error)", "return { success: false"]),
        summary: "后台页面和写操作应提供错误边界、表单错误和失败返回。",
        evidence: ["src/app/(dashboard)/dashboard/error.tsx", "src/features/orders/actions.ts"],
        action: "补齐后台错误页、表单错误提示和 server action 失败返回。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase6") && packageHasScript("test:rbac"),
        summary: "后台主链路应有只读 smoke 和 RBAC smoke 验证。",
        evidence: ["npm run test:phase6", "npm run test:rbac"],
        action: "补齐后台数据 smoke 和越权测试。",
      },
    },
    {
      key: "shop",
      area: "商城",
      label: "消费者商城",
      entry: {
        dimension: "真实入口",
        ready: all([
          "src/app/(shop)/shop/page.tsx",
          "src/app/(shop)/shop/catalog/page.tsx",
          "src/app/(shop)/shop/product/[id]/page.tsx",
          "src/app/(shop)/shop/cart/page.tsx",
          "src/app/(shop)/shop/checkout/page.tsx",
          "src/app/(shop)/shop/my-orders/page.tsx",
          "src/app/(shop)/shop/account/page.tsx",
        ]),
        summary: "商城需要覆盖首页、目录、详情、购物车、结算、订单和账号页。",
        evidence: ["src/app/(shop)/shop/**"],
        action: "补齐消费者主流程页面。",
        href: "/shop",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/shop/actions.ts", ["addToCart", "updateCartItemQuantity", "checkout"]),
        summary: "商城加购、改数量、结算和订单提交必须有真实后端动作。",
        evidence: ["src/features/shop/actions.ts", "src/features/shop/CartClient.tsx", "src/features/shop/CheckoutClient.tsx"],
        action: "补齐商城 server action、库存校验和提交失败反馈。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["protectedShopPrefixes", "/shop/cart", "/shop/checkout", "/shop/my-orders"]),
        summary: "购物车、结算、订单和账号页必须登录后访问。",
        evidence: ["src/features/auth/permissions.ts"],
        action: "补齐商城受保护路由和未登录跳转。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/shop/actions.ts") && includesAll("src/features/shop/actions.ts", ["提交商城订单", "取消商城订单", "确认商城收货", "更新商城个人资料"]),
        summary: "商城下单、取消、确认收货、地址和个人资料等客户关键行为必须写入操作日志。",
        evidence: ["src/features/shop/actions.ts", "src/features/logs/audit.ts"],
        action: "为商城下单、取消、确认收货、地址和资料变更补齐 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: has("src/app/(shop)/shop/error.tsx") && includesAny("src/features/shop/actions.ts", ["catch (error)", "return { success: false"]),
        summary: "商城页面和购物链路应有错误页、表单校验和失败提示。",
        evidence: ["src/app/(shop)/shop/error.tsx", "src/features/shop/actions.ts"],
        action: "补齐商城错误边界和加购/结算失败提示。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase5") && packageHasScript("test:ui-audit"),
        summary: "商城公开页、保护页和 UI 风格应有 smoke 或审计脚本覆盖。",
        evidence: ["npm run test:phase5", "npm run test:ui-audit"],
        action: "补齐商城主流程 smoke 和移动端/UI 审计。",
      },
    },
    {
      key: "dealer",
      area: "经销商",
      label: "经销商端",
      entry: {
        dimension: "真实入口",
        ready: all([
          "src/app/(dealer)/dealer/incoming/page.tsx",
          "src/app/(dealer)/dealer/my-orders/page.tsx",
          "src/app/(dealer)/dealer/stock/page.tsx",
          "src/app/(dealer)/dealer/settlement/page.tsx",
          "src/app/(dealer)/dealer/promotion/page.tsx",
          "src/app/(dealer)/dealer/leads/page.tsx",
        ]),
        summary: "经销商端需要覆盖接单、订单、库存、结算、推广和线索。",
        evidence: ["src/app/(dealer)/dealer/**"],
        action: "补齐经销商工作台缺失页面。",
        href: "/dealer/incoming",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/dealer/actions.ts", ["acceptRouting", "rejectRouting", "shipDealerOrder", "completeDealerOrder", "reportDealerStock"]),
        summary: "经销商必须能接单、拒单、发货、完成和上报库存。",
        evidence: ["src/features/dealer/actions.ts", "src/features/dealer/DealerOrderActions.tsx"],
        action: "补齐经销商操作、失败反馈和状态刷新。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["pathname.startsWith(\"/dealer\")", "normalized === \"DEALER\""]),
        summary: "经销商端必须只允许经销商角色访问。",
        evidence: ["src/features/auth/permissions.ts"],
        action: "补齐经销商端角色隔离和越权拦截。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/dealer/actions.ts"),
        summary: "经销商接单、拒单、履约和库存上报应写入审计记录。",
        evidence: ["src/features/dealer/actions.ts", "src/features/logs/audit.ts"],
        action: "为经销商关键操作补齐 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: has("src/app/(dealer)/dealer/error.tsx") && includesAny("src/features/dealer/actions.ts", ["catch (error)", "return { success: false"]),
        summary: "经销商移动端操作应有错误边界和失败提示。",
        evidence: ["src/app/(dealer)/dealer/error.tsx", "src/features/dealer/actions.ts"],
        action: "补齐经销商端错误页、操作失败提示和空状态。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:role-acceptance") && packageHasScript("test:rbac"),
        summary: "经销商端应纳入角色验收和 RBAC smoke。",
        evidence: ["npm run test:role-acceptance", "npm run test:rbac"],
        action: "补齐经销商登录态和接单链路 smoke。",
      },
    },
    {
      key: "ai",
      area: "AI",
      label: "AI 助手",
      entry: {
        dimension: "真实入口",
        ready: all(["src/features/ai/AiFloatingBubble.tsx", "src/app/api/ai/assistant/route.ts", "src/app/api/ai/assistant/confirm/route.ts"]),
        summary: "AI 应以浮窗和 API 形式进入业务系统，不应跳全页客服页替代。",
        evidence: ["src/features/ai/AiFloatingBubble.tsx", "src/app/api/ai/assistant/route.ts"],
        action: "补齐 AI 浮窗、SSE API 和确认 API。",
      },
      operation: {
        dimension: "真实操作",
        ready: all(["src/features/ai/tools/registry.ts", "src/features/ai/tools/executor.ts", "src/features/ai/tools/model-planner-v3.ts"]) && includes("src/features/ai/tools/registry.ts", "system_completeness_audit"),
        summary: "AI 应能按权限调用工具、生成确认卡并区分三层检查。",
        evidence: ["src/features/ai/tools/registry.ts", "src/features/ai/tools/executor.ts", "src/features/ai/tools/model-planner-v3.ts"],
        action: "补齐 AI 工具注册、执行器、模型规划和确认流程。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/ai/tools/executor.ts", ["roleHasPermission", "access"]) && includes("src/features/ai/tools/registry.ts", "permission"),
        summary: "AI 工具必须和角色权限绑定，管理员和业务角色不能混用能力。",
        evidence: ["src/features/ai/tools/executor.ts", "src/features/ai/tools/registry.ts"],
        action: "补齐 AI tool access 权限和执行前校验。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/ai/tools/executor.ts") || hasAudit("src/features/ai/tools/audit.ts"),
        summary: "AI 工具调用、确认、失败和高风险动作必须可审计。",
        evidence: ["src/features/ai/tools/executor.ts", "src/features/ai/tools/audit.ts"],
        action: "补齐 AI 工具调用审计和敏感字段脱敏。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/app/api/ai/assistant/route.ts", ["try {", "catch (error)", "encoderPayload(\"error\""]) && includes("src/features/ai/tools/executor.ts", "AiToolError"),
        summary: "AI SSE、确认接口和工具执行失败必须返回可理解错误。",
        evidence: ["src/app/api/ai/assistant/route.ts", "src/features/ai/tools/executor.ts"],
        action: "补齐 AI SSE 错误事件、确认失败响应和工具错误类型。",
      },
      verification: {
        dimension: "验证",
        ready: ["test:ai-tools", "test:ai-provider", "test:ai-runtime", "test:agent-capabilities"].every(packageHasScript),
        summary: "AI 工具、真实 provider、运行时和能力目录应有自动化回归。",
        evidence: ["npm run test:ai-tools", "npm run test:ai-provider", "npm run test:ai-runtime", "npm run test:agent-capabilities"],
        action: "补齐 AI planner、provider 和权限回归脚本。",
      },
    },
    {
      key: "permissions",
      area: "权限",
      label: "权限体系",
      entry: {
        dimension: "真实入口",
        ready: has("src/app/(dashboard)/dashboard/settings/page.tsx") && includes("src/app/(dashboard)/dashboard/settings/page.tsx", "PermissionPolicyPanel"),
        summary: "管理员应在设置中心看到固定角色权限矩阵、策略说明和审计入口。",
        evidence: ["src/app/(dashboard)/dashboard/settings/page.tsx"],
        action: "补齐权限策略可视化面板。",
        href: "/dashboard/settings#permission-policy",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/settings/actions.ts", ["createStaffUser", "setStaffUserStatus", "resetStaffUserPassword"]),
        summary: "权限相关账号操作应能创建、启停和重置密码。",
        evidence: ["src/features/settings/actions.ts", "src/features/settings/UserManager.tsx"],
        action: "补齐用户管理真实操作。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["permissionRoles", "canAccessPath", "roleHasPermission"]) && includes("src/app/(dashboard)/dashboard/settings/page.tsx", "固定角色矩阵"),
        summary: "权限体系采用固定角色矩阵，统一角色、路由、字段和 AI 工具判断；当前不提供运营后台动态改权限。",
        evidence: ["src/features/auth/permissions.ts"],
        action: "补齐统一权限判断和路由矩阵。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/settings/actions.ts"),
        summary: "账号启停、重置密码和业务参数修改应写入审计。",
        evidence: ["src/features/settings/actions.ts", "src/features/logs/audit.ts"],
        action: "补齐设置和账号管理审计。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAny("src/features/settings/actions.ts", ["catch (error)", "return { success: false"]) && has("src/app/forbidden/page.tsx"),
        summary: "权限拒绝和账号操作失败应有明确反馈。",
        evidence: ["src/features/settings/actions.ts", "src/app/forbidden/page.tsx"],
        action: "补齐权限拒绝页和账号操作失败提示。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:rbac") && packageHasScript("test:field-permissions"),
        summary: "权限路由和字段级权限应有自动化验证。",
        evidence: ["npm run test:rbac", "npm run test:field-permissions"],
        action: "补齐 RBAC 和字段权限 smoke。",
      },
    },
    {
      key: "orders",
      area: "订单",
      label: "订单中心",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/orders/page.tsx", "src/app/(dashboard)/dashboard/orders/[id]/page.tsx", "src/app/(dashboard)/dashboard/orders/new/page.tsx"]),
        summary: "订单需要列表、详情和手动开单入口。",
        evidence: ["src/app/(dashboard)/dashboard/orders/**"],
        action: "补齐订单列表、详情或手动开单入口。",
        href: "/dashboard/orders",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/orders/actions.ts", ["createManualOrder", "updateOrderStatus"]) && has("src/features/orders/routing.ts"),
        summary: "订单应能手动开单、状态流转和执行分单。",
        evidence: ["src/features/orders/actions.ts", "src/features/orders/routing.ts"],
        action: "补齐订单开单、状态流转和分单逻辑。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["orders:view", "orders:write", "orders:fulfill"]) && includes("src/features/orders/actions.ts", "requireDashboardPermission"),
        summary: "订单查看、开单和履约权限必须分离。",
        evidence: ["src/features/auth/permissions.ts", "src/features/orders/actions.ts"],
        action: "补齐订单权限拆分和 server action 权限校验。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/orders/actions.ts"),
        summary: "订单开单和状态变更必须写入审计。",
        evidence: ["src/features/orders/actions.ts"],
        action: "补齐订单关键操作 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/features/orders/actions.ts", ["catch (error)", "return { success: false"]) && has("src/features/orders/ManualOrderForm.tsx"),
        summary: "订单创建和状态变更失败应返回可显示错误。",
        evidence: ["src/features/orders/actions.ts", "src/features/orders/ManualOrderForm.tsx"],
        action: "补齐订单表单校验和失败提示。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase5") && packageHasScript("test:phase6"),
        summary: "订单 API、页面和数据库闭环应有 smoke 验证。",
        evidence: ["npm run test:phase5", "npm run test:phase6"],
        action: "补齐订单主链路 smoke。",
      },
    },
    {
      key: "inventory",
      area: "库存",
      label: "库存与仓储",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/inventory/page.tsx", "src/app/(dashboard)/dashboard/inventory/stock-in/page.tsx", "src/app/(dashboard)/dashboard/inventory/stock-out/page.tsx", "src/app/(dashboard)/dashboard/warehouse/page.tsx"]),
        summary: "库存应有总览、入库、出库和仓储作业入口。",
        evidence: ["src/app/(dashboard)/dashboard/inventory/**", "src/app/(dashboard)/dashboard/warehouse/**"],
        action: "补齐库存和仓储页面入口。",
        href: "/dashboard/inventory",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/inventory/actions.ts", ["stockIn", "stockOut"]) && hasActionQuality("src/features/warehouse/actions.ts", ["createStockCheck", "updateSafeStock"]),
        summary: "库存应支持入库、出库、盘点和安全库存维护。",
        evidence: ["src/features/inventory/actions.ts", "src/features/warehouse/actions.ts"],
        action: "补齐库存变动和盘点操作。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["inventory:manage", "warehouse:manage"]) && includes("src/features/inventory/actions.ts", "requireDashboardPermission"),
        summary: "库存和仓储作业必须限定管理员/仓管角色。",
        evidence: ["src/features/auth/permissions.ts", "src/features/inventory/actions.ts"],
        action: "补齐库存权限校验。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/inventory/actions.ts") && hasAudit("src/features/warehouse/actions.ts"),
        summary: "库存变动、盘点和安全库存调整必须可追溯。",
        evidence: ["src/features/inventory/actions.ts", "src/features/warehouse/actions.ts"],
        action: "补齐库存和仓储 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/features/inventory/actions.ts", ["catch (error)", "return { success: false"]) && has("src/features/inventory/StockMovementForm.tsx"),
        summary: "库存操作失败、数量非法和商品缺失应有明确提示。",
        evidence: ["src/features/inventory/actions.ts", "src/features/inventory/StockMovementForm.tsx"],
        action: "补齐库存表单校验和失败提示。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase6") && packageHasScript("test:role-acceptance"),
        summary: "库存数据和仓管角色验收应有自动化验证。",
        evidence: ["npm run test:phase6", "npm run test:role-acceptance"],
        action: "补齐库存和仓管验收 smoke。",
      },
    },
    {
      key: "finance",
      area: "财务",
      label: "财务与票据",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/finance/page.tsx", "src/app/(dashboard)/dashboard/finance/payments/page.tsx", "src/app/(dashboard)/dashboard/finance/receivable/page.tsx", "src/app/(dashboard)/dashboard/receipts/page.tsx"]),
        summary: "财务应有总览、收款、应收和开票入口。",
        evidence: ["src/app/(dashboard)/dashboard/finance/**", "src/app/(dashboard)/dashboard/receipts/page.tsx"],
        action: "补齐财务和票据页面。",
        href: "/dashboard/finance",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/finance/actions.ts", ["registerPayment"]) && hasActionQuality("src/features/receipts/actions.ts", ["issueInvoice"]),
        summary: "财务应支持收款登记和发票开具。",
        evidence: ["src/features/finance/actions.ts", "src/features/receipts/actions.ts"],
        action: "补齐财务收款和票据开具操作。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["finance:manage", "receipts:manage"]) && includes("src/features/finance/actions.ts", "requireDashboardPermission"),
        summary: "财务和票据字段必须限定财务/管理员角色。",
        evidence: ["src/features/auth/permissions.ts", "src/features/finance/actions.ts"],
        action: "补齐财务权限和字段级可见性。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/finance/actions.ts") && hasAudit("src/features/receipts/actions.ts"),
        summary: "收款、对账和开票必须写入审计。",
        evidence: ["src/features/finance/actions.ts", "src/features/receipts/actions.ts"],
        action: "补齐财务和票据 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/features/finance/actions.ts", ["catch (error)", "return { success: false"]) && includesAll("src/features/receipts/actions.ts", ["catch (error)", "return { success: false"]),
        summary: "收款失败、开票失败和权限拒绝必须有明确错误。",
        evidence: ["src/features/finance/actions.ts", "src/features/receipts/actions.ts"],
        action: "补齐财务/票据操作失败处理。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:field-permissions") && packageHasScript("test:role-acceptance"),
        summary: "财务字段权限和角色验收应有 smoke 覆盖。",
        evidence: ["npm run test:field-permissions", "npm run test:role-acceptance"],
        action: "补齐财务字段权限和开票链路测试。",
      },
    },
    {
      key: "marketing",
      area: "营销",
      label: "营销运营",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/marketing/page.tsx", "src/app/(dashboard)/dashboard/marketing/coupons/page.tsx", "src/app/(dashboard)/dashboard/product-pushes/page.tsx"]),
        summary: "营销应有运营总览、优惠券和新品推送入口。",
        evidence: ["src/app/(dashboard)/dashboard/marketing/**", "src/app/(dashboard)/dashboard/product-pushes/page.tsx"],
        action: "补齐营销页面入口。",
        href: "/dashboard/marketing",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/marketing/actions.ts", ["createCoupon", "issueCouponByTag", "createProductPush"]),
        summary: "营销应支持建券、发券和新品推送。",
        evidence: ["src/features/marketing/actions.ts"],
        action: "补齐营销活动、优惠券和推送操作。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["marketing:manage", "/dashboard/marketing"]) && includes("src/features/marketing/actions.ts", "requireDashboardPermission"),
        summary: "营销操作必须限定管理员/销售相关角色。",
        evidence: ["src/features/auth/permissions.ts", "src/features/marketing/actions.ts"],
        action: "补齐营销权限校验。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/marketing/actions.ts"),
        summary: "建券、发券和新品推送必须可追溯。",
        evidence: ["src/features/marketing/actions.ts"],
        action: "补齐营销操作 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/features/marketing/actions.ts", ["catch (error)", "return { success: false"]) && has("src/features/marketing/CouponForm.tsx"),
        summary: "营销表单校验、重复发券和推送失败应有明确反馈。",
        evidence: ["src/features/marketing/actions.ts", "src/features/marketing/CouponForm.tsx"],
        action: "补齐营销异常和表单错误提示。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:ai-tools") && packageHasScript("test:role-acceptance"),
        summary: "营销写操作和角色验收应纳入回归。",
        evidence: ["npm run test:ai-tools", "npm run test:role-acceptance"],
        action: "补齐优惠券/新品推送 smoke。",
      },
    },
    {
      key: "wechat",
      area: "微信生态",
      label: "微信生态程序能力",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/wechat/page.tsx", "src/app/api/wechat/mini/home/route.ts", "src/app/api/wechat/pay/prepay/route.ts"]),
        summary: "微信生态应有后台状态页、小程序 API 和支付 API 入口。",
        evidence: ["src/app/(dashboard)/dashboard/wechat/page.tsx", "src/app/api/wechat/**"],
        action: "补齐微信生态后台入口和 API 路由。",
        href: "/dashboard/wechat",
      },
      operation: {
        dimension: "真实操作",
        ready: all(["src/features/wechat/mini.ts", "src/features/wechat/pay.ts", "src/features/wechat/official.ts", "src/features/wechat/actions.ts"]),
        summary: "程序应具备小程序登录/购物、支付预下单、公众号模板和菜单同步能力；真实配置另由 launch 检查。",
        evidence: ["src/features/wechat/mini.ts", "src/features/wechat/pay.ts", "src/features/wechat/official.ts", "src/features/wechat/actions.ts"],
        action: "补齐微信服务层和菜单/模板/支付操作。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["wechat:manage", "/dashboard/wechat"]) && includes("src/features/wechat/actions.ts", "requireDashboardPermission"),
        summary: "公众号菜单和微信后台配置必须管理员权限。",
        evidence: ["src/features/auth/permissions.ts", "src/features/wechat/actions.ts"],
        action: "补齐微信管理权限。",
      },
      audit: {
        dimension: "审计",
        ready: includes("src/features/wechat/official.ts", "prisma.wechatMessageLog") || hasAudit("src/features/wechat/actions.ts"),
        summary: "模板消息、菜单同步和支付回调应保留日志。",
        evidence: ["src/features/wechat/official.ts", "src/features/wechat/actions.ts"],
        action: "补齐微信消息和配置操作审计。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/app/api/wechat/pay/prepay/route.ts", ["try {", "catch (error)"]) && includesAll("src/app/api/wechat/mini/cart/route.ts", ["try {", "catch (error)"]),
        summary: "小程序 API、支付预下单和回调失败必须返回结构化错误。",
        evidence: ["src/app/api/wechat/pay/prepay/route.ts", "src/app/api/wechat/mini/cart/route.ts"],
        action: "补齐微信 API 错误处理和 mock 边界。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:third-party") && packageHasScript("check:launch"),
        summary: "微信 mock/边界能力应有 smoke；真实密钥仍由 launch readiness 单独检查。",
        evidence: ["npm run test:third-party", "npm run check:launch"],
        action: "补齐微信小程序、公众号、支付边界 smoke。",
      },
    },
    {
      key: "logs",
      area: "日志",
      label: "操作日志",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/logs/page.tsx", "src/features/logs/LogFilters.tsx"]),
        summary: "管理员应能查看和筛选操作日志。",
        evidence: ["src/app/(dashboard)/dashboard/logs/page.tsx", "src/features/logs/LogFilters.tsx"],
        action: "补齐日志页面和筛选器。",
        href: "/dashboard/logs",
      },
      operation: {
        dimension: "真实操作",
        ready: all(["src/features/logs/audit.ts", "src/features/logs/actions.ts", "src/features/logs/ClearLogsButton.tsx"]),
        summary: "日志模块应能写入、查询并执行受控清理。",
        evidence: ["src/features/logs/audit.ts", "src/features/logs/actions.ts"],
        action: "补齐日志写入、查询和清理操作。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["logs:manage", "/dashboard/logs"]) && includes("src/features/logs/actions.ts", "requireDashboardPermission"),
        summary: "操作日志只能由管理员查看和清理。",
        evidence: ["src/features/auth/permissions.ts", "src/features/logs/actions.ts"],
        action: "补齐日志访问权限。",
      },
      audit: {
        dimension: "审计",
        ready: has("src/features/logs/audit.ts") && includes("src/features/logs/audit.ts", "prisma.auditLog"),
        summary: "系统应有统一审计写入函数。",
        evidence: ["src/features/logs/audit.ts"],
        action: "补齐统一 audit writer。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAny("src/features/logs/actions.ts", ["catch (error)", "return { success: false"]) && includesAny("src/features/logs/queries.ts", ["try {", "catch (error)"]),
        summary: "日志查询和清理失败应有可控反馈。",
        evidence: ["src/features/logs/actions.ts", "src/features/logs/queries.ts"],
        action: "补齐日志异常处理。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase6") && packageHasScript("test:field-permissions"),
        summary: "日志数量、脱敏和字段权限应有验证。",
        evidence: ["npm run test:phase6", "npm run test:field-permissions"],
        action: "补齐日志和敏感字段 smoke。",
      },
    },
    {
      key: "settings",
      area: "配置中心",
      label: "系统配置中心",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/settings/page.tsx", "src/app/(dashboard)/dashboard/settings/users/page.tsx"]),
        summary: "配置中心应有系统设置和用户管理入口。",
        evidence: ["src/app/(dashboard)/dashboard/settings/**"],
        action: "补齐系统设置和用户管理页面。",
        href: "/dashboard/settings",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/settings/actions.ts", ["saveBusinessConfigs", "createStaffUser", "setStaffUserStatus", "resetStaffUserPassword"]),
        summary: "配置中心应支持业务参数保存和用户账号管理。",
        evidence: ["src/features/settings/actions.ts"],
        action: "补齐配置保存和用户管理 server action。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["settings:manage", "/dashboard/settings"]) && includes("src/features/settings/actions.ts", "requireAdmin"),
        summary: "配置中心必须管理员专属。",
        evidence: ["src/features/auth/permissions.ts", "src/features/settings/actions.ts"],
        action: "补齐设置中心管理员校验。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/settings/actions.ts"),
        summary: "业务参数和用户账号变更必须写入审计。",
        evidence: ["src/features/settings/actions.ts"],
        action: "补齐设置中心 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/features/settings/actions.ts", ["catch (error)", "return { success: false"]) && has("src/features/settings/BusinessConfigForm.tsx"),
        summary: "配置保存、账号启停和密码重置失败应有明确提示。",
        evidence: ["src/features/settings/actions.ts", "src/features/settings/BusinessConfigForm.tsx"],
        action: "补齐设置中心异常和表单错误提示。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:rbac") && packageHasScript("check:system"),
        summary: "配置中心权限和完整度应纳入自动化验证。",
        evidence: ["npm run test:rbac", "npm run check:system"],
        action: "补齐配置中心 smoke。",
      },
    },
    {
      key: "reports",
      area: "报表",
      label: "经营报表",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/sales/page.tsx", "src/app/(dashboard)/dashboard/finance/statements/page.tsx", "src/app/(dashboard)/dashboard/marketing/operations/page.tsx"]),
        summary: "报表应有销售、财务对账和运营分析入口。",
        evidence: ["src/app/(dashboard)/dashboard/sales/page.tsx", "src/app/(dashboard)/dashboard/finance/statements/page.tsx", "src/app/(dashboard)/dashboard/marketing/operations/page.tsx"],
        action: "补齐经营报表入口。",
        href: "/dashboard/sales",
      },
      operation: {
        dimension: "真实操作",
        ready: all(["src/features/sales/queries.ts", "src/features/finance/queries.ts", "src/features/marketing/queries.ts"]) && has("src/features/receipts/ExportPaymentsButton.tsx"),
        summary: "报表应基于真实查询数据，并提供必要导出能力。",
        evidence: ["src/features/sales/queries.ts", "src/features/finance/queries.ts", "src/features/marketing/queries.ts"],
        action: "补齐报表查询、汇总和导出。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["sales:view", "finance:manage", "/dashboard/sales"]),
        summary: "销售、财务和运营报表应按角色授权访问。",
        evidence: ["src/features/auth/permissions.ts"],
        action: "补齐报表权限矩阵。",
      },
      audit: {
        dimension: "审计",
        ready:
          includesAll("src/features/reports/actions.ts", ["logReportExport", "logAction", "导出订单报表", "导出票据报表", "导出财务对账单"]) &&
          includes("src/features/orders/ExportOrdersButton.tsx", "logReportExport") &&
          includes("src/features/receipts/ExportPaymentsButton.tsx", "logReportExport") &&
          includes("src/features/finance/StatementTools.tsx", "logReportExport"),
        severityWhenMissing: "TODO",
        summary: "报表多为只读查询，但订单、票据和财务对账单导出必须写入审计，避免敏感数据批量导出不可追溯。",
        evidence: ["src/features/reports/actions.ts", "src/features/orders/ExportOrdersButton.tsx", "src/features/receipts/ExportPaymentsButton.tsx", "src/features/finance/StatementTools.tsx"],
        action: "为敏感报表导出补齐审计记录。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAny("src/features/sales/queries.ts", ["try {", "catch (error)"]) || includesAny("src/features/finance/queries.ts", ["try {", "catch (error)"]),
        summary: "报表查询失败应降级为空数据或明确报错。",
        evidence: ["src/features/sales/queries.ts", "src/features/finance/queries.ts"],
        action: "补齐报表查询异常处理。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase6") && packageHasScript("test:field-permissions"),
        summary: "报表数据和财务字段可见性应有 smoke 验证。",
        evidence: ["npm run test:phase6", "npm run test:field-permissions"],
        action: "补齐销售/财务报表 smoke。",
      },
    },
    {
      key: "map_delivery",
      area: "地图配送",
      label: "地图与配送",
      entry: {
        dimension: "真实入口",
        ready: all(["src/app/(dashboard)/dashboard/map/page.tsx", "src/app/(dashboard)/dashboard/delivery/page.tsx", "src/app/(dashboard)/dashboard/delivery/[id]/page.tsx"]),
        summary: "地图配送应有地图页、配送列表和配送详情入口。",
        evidence: ["src/app/(dashboard)/dashboard/map/page.tsx", "src/app/(dashboard)/dashboard/delivery/**"],
        action: "补齐地图和配送页面。",
        href: "/dashboard/map",
      },
      operation: {
        dimension: "真实操作",
        ready: hasActionQuality("src/features/delivery/actions.ts", ["markOrderShipped", "markOrderDelivered"]) && has("src/features/orders/DealerMap.tsx") && has("src/features/orders/map-queries.ts"),
        summary: "配送应能发货、送达，并在地图查看经销商范围。",
        evidence: ["src/features/delivery/actions.ts", "src/features/orders/DealerMap.tsx", "src/features/orders/map-queries.ts"],
        action: "补齐配送动作和地图数据查询。",
      },
      permission: {
        dimension: "权限",
        ready: includesAll("src/features/auth/permissions.ts", ["delivery:manage", "/dashboard/delivery", "/dashboard/map"]) && includes("src/features/delivery/actions.ts", "requireDashboardPermission"),
        summary: "配送操作和地图调度应限定授权角色。",
        evidence: ["src/features/auth/permissions.ts", "src/features/delivery/actions.ts"],
        action: "补齐配送权限校验。",
      },
      audit: {
        dimension: "审计",
        ready: hasAudit("src/features/delivery/actions.ts"),
        summary: "发货、送达和配送异常处理应写入审计。",
        evidence: ["src/features/delivery/actions.ts"],
        action: "补齐配送 logAction。",
      },
      exception: {
        dimension: "异常处理",
        ready: includesAll("src/features/orders/DealerMap.tsx", ["LoadState", "error"]) && includesAll("src/features/delivery/actions.ts", ["catch (error)", "return { success: false"]),
        summary: "地图加载失败、缺少 Key、配送动作失败都应有页面提示。",
        evidence: ["src/features/orders/DealerMap.tsx", "src/features/delivery/actions.ts"],
        action: "补齐地图加载失败和配送操作失败反馈。",
      },
      verification: {
        dimension: "验证",
        ready: packageHasScript("test:phase6") && packageHasScript("test:third-party"),
        summary: "配送数据和地图第三方边界应有 smoke 验证。",
        evidence: ["npm run test:phase6", "npm run test:third-party"],
        action: "补齐配送和地图边界 smoke。",
      },
    },
  ];

  const modules = specs.map((spec) =>
    buildModule(spec.key, spec.area, spec.label, [spec.entry, spec.operation, spec.permission, spec.audit, spec.exception, spec.verification].map((criterion) => item(spec, criterion))),
  );
  const items = modules.flatMap((entry) => entry.items);
  const blockerCount = items.filter((entry) => entry.severity === "BLOCKER").length;
  const warningCount = items.filter((entry) => entry.severity === "WARNING").length;
  const todoCount = items.filter((entry) => entry.severity === "TODO").length;
  const readyCount = items.filter((entry) => entry.severity === "READY").length;

  return {
    checkedAt: new Date().toISOString(),
    status: blockerCount > 0 ? "BLOCKER" : warningCount > 0 ? "WARNING" : todoCount > 0 ? "TODO" : "READY",
    readyCount,
    todoCount,
    warningCount,
    blockerCount,
    modules,
    items,
  };
}

function buildModule(key: string, area: SystemCompletenessArea, label: string, items: SystemCompletenessItem[]): SystemCompletenessModule {
  const status = moduleStatus(items);
  return {
    key,
    area,
    label,
    status,
    summary: moduleSummary(status),
    items,
  };
}
