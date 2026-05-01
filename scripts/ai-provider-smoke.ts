import { loadEnvConfig } from "@next/env";

import { hasAiProvider } from "@/features/ai/provider";
import { planWithModelV2 } from "@/features/ai/tools/model-planner";
import { aiTools, canRoleUseTool } from "@/features/ai/tools/registry";
import type { AiToolContext } from "@/features/ai/tools/types";

loadEnvConfig(process.cwd());

type ProviderCase = {
  role: AiToolContext["role"];
  message: string;
  expectedTool: string;
};

const cases: ProviderCase[] = [
  { role: "ADMIN", message: "现在上线还差什么配置", expectedTool: "system_launch_readiness" },
  { role: "ADMIN", message: "现在库存有多少商品，哪个库存最多？", expectedTool: "product_operations_summary" },
  { role: "FINANCE", message: "谁欠款最多？", expectedTool: "finance_summary" },
  { role: "ADMIN", message: "李明最近转化怎么样？", expectedTool: "salesperson_performance" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function context(role: AiToolContext["role"]): AiToolContext {
  return {
    role,
    isStaff: role !== "CONSUMER" && role !== "DEALER",
    user: {
      id: `${role.toLowerCase()}-provider-smoke`,
      name: role,
      role,
      type: role === "CONSUMER" || role === "DEALER" ? "CUSTOMER" : "STAFF",
    },
  };
}

async function main() {
  if (!hasAiProvider()) {
    throw new Error("AI provider 未配置。请设置 AI_BASE_URL、AI_API_KEY、AI_MODEL；如需 think 模式，设置 AI_THINKING_ENABLED=true。");
  }

  for (const testCase of cases) {
    const aiContext = context(testCase.role);
    const tools = aiTools.filter((tool) => canRoleUseTool(testCase.role, tool.name));
    const result = await planWithModelV2(testCase.message, aiContext, tools);
    const topTools = result.rankedTools.slice(0, 4).map((item) => item.tool.name).join(", ");
    assert(
      result.plan?.toolName === testCase.expectedTool,
      `真实 AI provider 未命中预期工具：message=${testCase.message} expected=${testCase.expectedTool} actual=${result.plan?.toolName ?? "null"} top=${topTools} error=${result.error ?? ""} raw=${result.rawText?.slice(0, 300) ?? ""}`,
    );
  }

  console.log(
    `AI provider smoke passed: ${cases.length} planner-v2 cases, thinking=${process.env.AI_THINKING_ENABLED === "true" || process.env.AI_THINKING_ENABLED === "1" ? "enabled" : "disabled"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
