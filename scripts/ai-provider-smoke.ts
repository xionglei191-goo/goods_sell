import { callAnthropicCompatible, hasAiProvider } from "@/features/ai/provider";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { toolName?: string; args?: Record<string, unknown>; reason?: string };
  } catch {
    return null;
  }
}

async function main() {
  if (!hasAiProvider()) {
    throw new Error("AI provider 未配置。请设置 AI_BASE_URL、AI_API_KEY、AI_MODEL；如需 think 模式，设置 AI_THINKING_ENABLED=true。");
  }

  const text = await callAnthropicCompatible({
    maxTokens: 1536,
    system: "你是业务系统的工具规划器。只返回 JSON，不要解释。JSON 格式：{\"toolName\":\"工具名\",\"args\":{},\"reason\":\"原因\"}。",
    messages: [
      {
        role: "user",
        content:
          "可用工具：\n- system_launch_readiness：检查上线配置\n- business_overview：查看经营总览\n\n用户请求：现在上线还差什么配置",
      },
    ],
  });

  const parsed = extractJsonObject(text);
  assert(parsed?.toolName === "system_launch_readiness", `真实 AI provider 未命中预期工具，返回：${text.slice(0, 300)}`);
  console.log(
    `AI provider smoke passed: model planned ${parsed.toolName}, thinking=${process.env.AI_THINKING_ENABLED === "true" || process.env.AI_THINKING_ENABLED === "1" ? "enabled" : "disabled"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
