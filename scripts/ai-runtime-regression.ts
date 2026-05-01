import { loadEnvConfig } from "@next/env";

import { executeAiTool, AiToolError } from "@/features/ai/tools/executor";
import { buildClarificationResponse, rankAiToolsForMessage } from "@/features/ai/tools/model-planner";
import { planAiToolCall } from "@/features/ai/tools/planner";
import { aiTools, canRoleUseTool } from "@/features/ai/tools/registry";
import { prisma } from "@/lib/prisma";
import type { AiToolContext } from "@/features/ai/tools/types";

loadEnvConfig(process.cwd());

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function customerContext(id: string, name: string): AiToolContext {
  return {
    role: "DEALER",
    isStaff: false,
    user: { id, name, role: "DEALER", type: "CUSTOMER" },
  };
}

function salespersonContext(id: string, name: string): AiToolContext {
  return {
    role: "SALESPERSON",
    isStaff: true,
    user: { id, name, role: "SALESPERSON", type: "STAFF" },
  };
}

function warehouseContext(id: string, name: string): AiToolContext {
  return {
    role: "WAREHOUSE",
    isStaff: true,
    user: { id, name, role: "WAREHOUSE", type: "STAFF" },
  };
}

async function main() {
  const dealerCustomer = await prisma.customer.findFirst({ where: { phone: "13900139101" }, select: { id: true, name: true } });
  const salesperson = await prisma.user.findFirst({ where: { phone: "13800138001" }, select: { id: true, name: true } });
  const warehouse = await prisma.user.findFirst({ where: { role: "WAREHOUSE" }, select: { id: true, name: true } });
  assert(dealerCustomer, "缺少经销商测试账号 13900139101");
  assert(salesperson, "缺少销售员测试账号 13800138001");
  assert(warehouse, "缺少仓管测试账号");

  const dealerContext = customerContext(dealerCustomer.id, dealerCustomer.name);
  const salesContext = salespersonContext(salesperson.id, salesperson.name);
  const warehouseUserContext = warehouseContext(warehouse.id, warehouse.name);
  const dealerTools = aiTools.filter((tool) => canRoleUseTool("DEALER", tool.name));
  const salesTools = aiTools.filter((tool) => canRoleUseTool("SALESPERSON", tool.name));
  const warehouseTools = aiTools.filter((tool) => canRoleUseTool("WAREHOUSE", tool.name));
  const pendingRouting = await prisma.orderRouting.findFirst({
    where: { dealer: { customerId: dealerCustomer.id }, status: "PENDING" },
    include: { order: { select: { orderNo: true } } },
    orderBy: { assignedAt: "asc" },
  });
  assert(pendingRouting, "经销商没有待接订单，无法回归接单/拒单确认卡");

  const stockPlan = planAiToolCall("把青岛经典啤酒门店库存上报为9", dealerContext, dealerTools);
  assert(stockPlan?.toolName === "dealer_report_stock", "经销商库存上报应命中 dealer_report_stock");
  const stockExecution = await executeAiTool(stockPlan.toolName, stockPlan.args, dealerContext);
  assert(stockExecution.status === "needs_confirmation", "经销商库存上报应生成确认卡");
  assert(stockExecution.card.kind === "confirmation" && stockExecution.card.pendingAction.title === "确认上报库存", "经销商库存上报确认卡标题不正确");

  const acceptPlan = planAiToolCall(`接单 ${pendingRouting.order.orderNo}`, dealerContext, dealerTools);
  assert(acceptPlan?.toolName === "dealer_accept_routing", "经销商接单应命中 dealer_accept_routing");
  const acceptExecution = await executeAiTool(acceptPlan.toolName, acceptPlan.args, dealerContext);
  assert(acceptExecution.status === "needs_confirmation", "经销商接单应生成确认卡");
  assert(acceptExecution.card.kind === "confirmation" && acceptExecution.card.pendingAction.title === "确认接单", "经销商接单确认卡标题不正确");

  const rejectPlan = planAiToolCall(`拒单 ${pendingRouting.order.orderNo} 原因 太远`, dealerContext, dealerTools);
  assert(rejectPlan?.toolName === "dealer_reject_routing", "经销商拒单应命中 dealer_reject_routing");
  const rejectExecution = await executeAiTool(rejectPlan.toolName, rejectPlan.args, dealerContext);
  assert(rejectExecution.status === "needs_confirmation", "经销商拒单应生成确认卡");
  assert(rejectExecution.card.kind === "confirmation" && rejectExecution.card.pendingAction.title === "确认拒单", "经销商拒单确认卡标题不正确");

  const readinessPlan = planAiToolCall("现在上线还差什么配置", salesContext, salesTools);
  assert(readinessPlan?.toolName === "system_launch_readiness", "销售员 readiness 意图应进入权限拦截工具");
  let blocked = false;
  try {
    await executeAiTool(readinessPlan.toolName, readinessPlan.args, salesContext);
  } catch (error) {
    blocked = error instanceof AiToolError && error.status === 403;
  }
  assert(blocked, "销售员 readiness 请求应被 403 权限拦截");

  const purchaseHistoryPlan = planAiToolCall("张阿姨买了什么东西", salesContext, salesTools);
  assert(purchaseHistoryPlan?.toolName === "customer_purchase_history", "销售员查询客户买了什么应命中购买历史工具");
  const purchaseHistoryExecution = await executeAiTool(purchaseHistoryPlan.toolName, purchaseHistoryPlan.args, salesContext);
  assert(purchaseHistoryExecution.status === "success", "客户购买历史查询应直接返回结果");
  assert(purchaseHistoryExecution.result.title === "客户购买历史", "客户购买历史结果标题不正确");

  const blockedWarehouseHistoryPlan = planAiToolCall("张阿姨买了什么东西", warehouseUserContext, warehouseTools);
  assert(!blockedWarehouseHistoryPlan, "仓管查询客户购买历史不应被规划到任何可用工具");

  const vaguePlan = planAiToolCall("帮我处理一下", salesContext, salesTools);
  const vagueClarification = buildClarificationResponse("帮我处理一下", rankAiToolsForMessage("帮我处理一下", salesContext, salesTools));
  assert(!vaguePlan, "低置信问题不应被启发式兜底成可执行工具");
  assert(vagueClarification.card.kind === "result" && vagueClarification.card.title === "需要补充信息", "低置信问题应返回澄清卡片");
  assert(!vagueClarification.answer.includes("可用 AI 工具"), "低置信澄清不应回退为工具清单");

  console.log("AI runtime regression passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
