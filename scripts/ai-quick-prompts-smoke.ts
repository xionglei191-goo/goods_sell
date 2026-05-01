import { loadEnvConfig } from "@next/env";

import { getVerifiedQuickPrompts, planVerifiedQuickPrompt } from "@/features/ai/intent-templates";
import { executeAiTool, getAvailableAiTools } from "@/features/ai/tools/executor";
import { prisma } from "@/lib/prisma";
import type { AiToolContext } from "@/features/ai/tools/types";

loadEnvConfig(process.cwd());

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function context(input: {
  id: string;
  name: string | null;
  phone?: string | null;
  role: AiToolContext["role"];
  type: "STAFF" | "CUSTOMER";
}): AiToolContext {
  return {
    role: input.role,
    isStaff: input.type === "STAFF",
    user: {
      id: input.id,
      name: input.name ?? input.role,
      phone: input.phone ?? undefined,
      role: input.role,
      type: input.type,
    },
  };
}

async function main() {
  const [admin, salesperson, warehouse, finance, consumer, dealerCustomer, activeProduct, swordProductCount] = await Promise.all([
    prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true, name: true, phone: true, role: true } }),
    prisma.user.findFirst({ where: { role: "SALESPERSON", isActive: true }, select: { id: true, name: true, phone: true, role: true } }),
    prisma.user.findFirst({ where: { role: "WAREHOUSE", isActive: true }, select: { id: true, name: true, phone: true, role: true } }),
    prisma.user.findFirst({ where: { role: "FINANCE", isActive: true }, select: { id: true, name: true, phone: true, role: true } }),
    prisma.customer.findFirst({
      where: { type: "CONSUMER", isVerified: true, addresses: { some: {} } },
      select: { id: true, name: true, phone: true },
    }),
    prisma.customer.findFirst({
      where: { type: "DEALER", isVerified: true, dealer: { isNot: null } },
      select: { id: true, name: true, phone: true },
    }),
    prisma.product.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, stock: true, retailPrice: true },
      orderBy: [{ salesCount: "desc" }, { stock: "desc" }, { createdAt: "asc" }],
    }),
    prisma.product.count({ where: { OR: [{ name: { contains: "剑兰春" } }, { sku: { contains: "剑兰春" } }] } }),
  ]);

  assert(admin, "缺少管理员账号");
  assert(salesperson, "缺少销售员账号");
  assert(warehouse, "缺少仓管账号");
  assert(finance, "缺少财务账号");
  assert(consumer, "缺少带地址的消费者账号");
  assert(dealerCustomer, "缺少已审核经销商账号");
  assert(activeProduct, "缺少上架商品");

  const contexts = [
    context({ ...admin, role: "ADMIN", type: "STAFF" }),
    context({ ...salesperson, role: "SALESPERSON", type: "STAFF" }),
    context({ ...warehouse, role: "WAREHOUSE", type: "STAFF" }),
    context({ ...finance, role: "FINANCE", type: "STAFF" }),
    context({ ...consumer, role: "CONSUMER", type: "CUSTOMER" }),
    context({ ...dealerCustomer, role: "DEALER", type: "CUSTOMER" }),
  ];

  for (const item of contexts) {
    const tools = getAvailableAiTools(item);
    const prompts = await getVerifiedQuickPrompts(item, tools);
    assert(prompts.length > 0, `${item.role} 应至少返回一个已验证固定词条`);
    assert(prompts.every((prompt) => prompt.verified === true), `${item.role} 固定词条必须标记 verified`);
    assert(prompts.every((prompt) => tools.some((tool) => tool.name === prompt.toolName)), `${item.role} 固定词条必须引用可用 tool`);
    for (const prompt of prompts) {
      const plan = await planVerifiedQuickPrompt(prompt.id, item, tools);
      const tool = tools.find((candidate) => candidate.name === prompt.toolName);
      assert(plan?.toolName === prompt.toolName, `${item.role}/${prompt.id} 应能重新规划为同一 tool`);
      assert(tool?.inputSchema.safeParse(plan.args).success, `${item.role}/${prompt.id} 参数必须通过 schema`);
    }
    if (swordProductCount === 0) {
      assert(!prompts.some((prompt) => prompt.text.includes("剑兰春")), `${item.role} 不应展示不存在商品“剑兰春”的固定词条`);
    }
  }

  const warehouseContext = contexts.find((item) => item.role === "WAREHOUSE");
  assert(warehouseContext, "缺少仓管上下文");
  const warehouseTools = getAvailableAiTools(warehouseContext);
  const warehousePrompts = await getVerifiedQuickPrompts(warehouseContext, warehouseTools);
  const stockInPrompt = warehousePrompts.find((prompt) => prompt.toolName === "inventory_stock_in");
  assert(stockInPrompt, "仓管应展示一个已预检通过的入库确认词条");
  assert(stockInPrompt.text.includes(activeProduct.name), "入库固定词条应使用当前真实商品名");

  const stockBefore = await prisma.product.findUnique({ where: { id: activeProduct.id }, select: { stock: true, retailPrice: true } });
  const orderCountBefore = await prisma.order.count();
  const plan = await planVerifiedQuickPrompt(stockInPrompt.id, warehouseContext, warehouseTools);
  assert(plan, "入库固定词条应可重新生成 plan");
  process.env.AI_TOOL_TEST_SESSION_USER = JSON.stringify(warehouseContext.user);
  const execution = await executeAiTool(plan.toolName, plan.args, warehouseContext);
  delete process.env.AI_TOOL_TEST_SESSION_USER;
  assert(execution.status === "needs_confirmation", "写操作固定词条点击后应只生成确认卡");
  const [stockAfter, orderCountAfter] = await Promise.all([
    prisma.product.findUnique({ where: { id: activeProduct.id }, select: { stock: true, retailPrice: true } }),
    prisma.order.count(),
  ]);
  assert(stockAfter?.stock === stockBefore?.stock, "未确认前不应改变商品库存");
  assert(Number(stockAfter?.retailPrice) === Number(stockBefore?.retailPrice), "未确认前不应改变商品价格");
  assert(orderCountAfter === orderCountBefore, "未确认前不应创建订单");

  console.log("AI quick prompts smoke passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    delete process.env.AI_TOOL_TEST_SESSION_USER;
    await prisma.$disconnect();
  });
