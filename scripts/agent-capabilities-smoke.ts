import { readdirSync, statSync } from "fs";
import { join, relative } from "path";

import { aiTools, canRoleUseTool } from "@/features/ai/tools/registry";
import {
  agentCapabilities,
  canUseAgentCapability,
  findAgentCapabilityById,
  rankAgentCapabilitiesForMessage,
} from "@/features/ai/tools/capabilities";
import { appRoles, canAccessPath, type AppRole } from "@/features/auth/permissions";
import { planAgentCapabilityNavigation, rankAiToolsForMessage } from "@/features/ai/tools/model-planner";
import type { AiToolContext } from "@/features/ai/tools/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function context(role: AppRole): AiToolContext {
  return {
    role,
    isStaff: role !== "CONSUMER" && role !== "DEALER",
    user: {
      id: `${role.toLowerCase()}-id`,
      name: role,
      role,
      type: role === "CONSUMER" || role === "DEALER" ? "CUSTOMER" : "STAFF",
    },
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function pageFileToRoute(file: string) {
  const relativePath = relative(join(process.cwd(), "src", "app"), file).replace(/\\/g, "/");
  const route = relativePath
    .replace(/(^|\/)page\.tsx$/, "")
    .split("/")
    .filter((segment) => segment && !segment.startsWith("("))
    .join("/");
  return route ? `/${route}` : "/";
}

function topToolName(message: string, role: AppRole) {
  const tools = aiTools.filter((tool) => canRoleUseTool(role, tool.name));
  return rankAiToolsForMessage(message, context(role), tools)[0]?.tool.name;
}

function navPlan(message: string, role: AppRole) {
  const tools = aiTools.filter((tool) => canRoleUseTool(role, tool.name));
  return planAgentCapabilityNavigation(message, context(role), tools);
}

function main() {
  const ids = new Set(agentCapabilities.map((capability) => capability.id));
  assert(ids.size === agentCapabilities.length, "Agent capability id 必须唯一");
  assert(canRoleUseTool("ADMIN", "navigate_to_feature"), "管理员应可使用功能入口工具");
  assert(canRoleUseTool("ADMIN", "feature_help"), "管理员应可使用功能帮助工具");

  const coveredPaths = new Set(agentCapabilities.flatMap((capability) => capability.paths));
  const pageRoutes = walk(join(process.cwd(), "src", "app"))
    .filter((file) => file.endsWith("page.tsx"))
    .map(pageFileToRoute);
  const missingRoutes = pageRoutes.filter((route) => !coveredPaths.has(route));
  assert(missingRoutes.length === 0, `以下页面缺少 AgentCapability 覆盖：${missingRoutes.join(", ")}`);

  for (const capability of agentCapabilities) {
    assert(capability.href.startsWith("/"), `${capability.id} href 必须是站内路径`);
    assert(capability.paths.length > 0, `${capability.id} 必须声明覆盖路径`);
    assert(capability.capabilities.length > 0, `${capability.id} 必须声明语义关键词`);
    for (const role of appRoles) {
      const expected = capability.paths.some((path) => canAccessPath(role, path));
      assert(canUseAgentCapability(context(role), capability) === expected, `${capability.id} 与 canAccessPath 规则不一致：${role}`);
    }
  }

  assert(findAgentCapabilityById("purchase.suppliers")?.href === "/dashboard/purchase/suppliers", "供应商 capability 应指向供应商页");
  assert(rankAgentCapabilitiesForMessage("供应商管理在哪", context("ADMIN"))[0]?.capability.id === "purchase.suppliers", "供应商问法应命中供应商能力");
  assert(navPlan("供应商管理在哪", "ADMIN")?.args.capabilityId === "purchase.suppliers", "供应商问法应生成导航 plan");
  assert(navPlan("怎么查看库存流水", "ADMIN")?.args.capabilityId === "inventory.records", "库存流水问法应生成导航 plan");
  assert(navPlan("帮我打开经销商政策", "ADMIN")?.args.capabilityId === "dealers.policy", "经销商政策问法应生成导航 plan");
  assert(navPlan("微信菜单在哪配置", "ADMIN")?.args.capabilityId === "wechat.settings", "微信菜单问法应生成导航 plan");
  assert(navPlan("查购物车", "CONSUMER")?.args.capabilityId === "shop.cart", "消费者购物车问法应生成导航 plan");

  assert(topToolName("供应商管理在哪", "ADMIN") === "navigate_to_feature", "功能位置问法应优先进入导航工具");
  assert(topToolName("怎么查看库存流水", "ADMIN") === "navigate_to_feature", "库存流水位置问法应优先进入导航工具");
  assert(topToolName("谁欠款最多", "FINANCE") === "finance_summary", "欠款排行不能被导航工具抢占");
  assert(topToolName("现在一共有多少客户，哪个消费最高", "ADMIN") === "customer_analytics_summary", "客户统计不能被导航工具抢占");
  assert(topToolName("现在库存有多少商品，哪个库存最多", "ADMIN") === "product_operations_summary", "库存统计不能被导航工具抢占");

  console.log(`Agent capability smoke passed: ${agentCapabilities.length} capabilities, ${pageRoutes.length} pages`);
}

main();
