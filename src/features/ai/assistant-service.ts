import { callAnthropicCompatible, hasAiProvider } from "@/features/ai/provider";
import { auditAiAssistant } from "@/features/ai/tools/audit";
import { getAiToolContext } from "@/features/ai/tools/context";
import { executeAiTool, getAvailableAiTools, AiToolError } from "@/features/ai/tools/executor";
import { planAiToolCall } from "@/features/ai/tools/planner";
import { describeAiToolsForPrompt } from "@/features/ai/tools/registry";
import type { AiAssistantCard, AiToolPlan } from "@/features/ai/tools/types";

type AssistantResponse = {
  answer: string;
  card: AiAssistantCard | null;
  plan: AiToolPlan | null;
};

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

async function planWithModel(message: string, toolsText: string): Promise<AiToolPlan | null> {
  if (!hasAiProvider()) return null;
  try {
    const text = await callAnthropicCompatible({
      maxTokens: 512,
      system:
        "你是业务系统的工具规划器。只返回 JSON，不要解释。JSON 格式：{\"toolName\":\"工具名\",\"args\":{},\"reason\":\"原因\"}。如果没有合适工具，toolName 为空字符串。",
      messages: [
        {
          role: "user",
          content: `可用工具：\n${toolsText}\n\n用户请求：${message}`,
        },
      ],
    });
    const parsed = extractJsonObject(text);
    if (!parsed?.toolName) return null;
    return { toolName: parsed.toolName, args: parsed.args ?? {}, reason: parsed.reason ?? "模型规划" };
  } catch {
    return null;
  }
}

function answerForExecution(execution: Awaited<ReturnType<typeof executeAiTool>>) {
  if (execution.status === "needs_confirmation") {
    return `${execution.pendingAction.summary}\n请确认后我再执行。`;
  }
  return execution.result.summary;
}

export async function answerAssistantMessage(message: string): Promise<AssistantResponse> {
  const context = await getAiToolContext();
  const tools = getAvailableAiTools(context);
  const heuristicPlan = planAiToolCall(message, context, tools);
  const modelPlan = heuristicPlan ? null : await planWithModel(message, describeAiToolsForPrompt(tools));
  const plan = heuristicPlan ?? modelPlan;

  if (!plan) {
    const response: AssistantResponse = {
      answer: `我可以帮你处理这些事：${tools.slice(0, 6).map((tool) => tool.title).join("、")}。你可以直接说“查库存”“这个月张军业绩怎么样”或“我要下单 1 箱某商品”。`,
      card: {
        kind: "result",
        title: "可用 AI 工具",
        summary: `当前角色可用 ${tools.length} 个工具。`,
        details: tools.slice(0, 10).map((tool) => ({ label: tool.title, value: tool.description })),
      },
      plan: null,
    };
    await auditAiAssistant({
      action: "AI 未命中工具",
      summary: `用户请求未命中可执行工具：${message.slice(0, 80)}`,
      input: message,
      status: "no_plan",
      result: response.card,
    });
    return response;
  }

  try {
    const execution = await executeAiTool(plan.toolName, plan.args, context);
    const response: AssistantResponse = {
      answer: answerForExecution(execution),
      card: execution.card,
      plan,
    };
    await auditAiAssistant({
      action: execution.status === "needs_confirmation" ? "AI 生成确认卡片" : "AI 执行工具完成",
      summary: execution.status === "needs_confirmation" ? `AI 已为 ${plan.toolName} 生成确认卡片` : `AI 已执行 ${plan.toolName}`,
      input: message,
      plan,
      status: execution.status,
      result: execution.status === "needs_confirmation" ? execution.pendingAction : execution.result,
    });
    return response;
  } catch (error) {
    if (error instanceof AiToolError) {
      await auditAiAssistant({
        action: "AI 工具执行失败",
        summary: `AI 工具 ${plan.toolName} 执行失败：${error.message}`,
        input: message,
        plan,
        status: "failed",
        error: error.message,
      });
      return {
        answer: error.message,
        card: {
          kind: "result",
          title: "无法执行",
          summary: error.message,
          details: [{ label: "原因", value: error.status === 403 ? "权限不足" : "参数或业务条件不满足" }],
        },
        plan,
      };
    }
    const messageText = error instanceof Error ? error.message : "AI 助手暂时无法完成这个操作";
    await auditAiAssistant({
      action: "AI 工具执行异常",
      summary: `AI 工具 ${plan.toolName} 执行异常：${messageText}`,
      input: message,
      plan,
      status: "error",
      error: messageText,
    });
    return {
      answer: messageText,
      card: {
        kind: "result",
        title: "执行失败",
        summary: messageText,
        details: [],
      },
      plan,
    };
  }
}

export async function confirmAssistantTool(input: { toolName?: string; args?: Record<string, unknown>; confirmText?: string; confirmationToken?: string }) {
  if (!input.toolName || !input.args) {
    throw new AiToolError("确认信息不完整", 400);
  }
  const context = await getAiToolContext();
  const plan = { toolName: input.toolName, args: input.args, reason: "用户确认执行" };
  try {
    const execution = await executeAiTool(input.toolName, input.args, context, { confirmed: true, confirmText: input.confirmText, confirmationToken: input.confirmationToken });
    await auditAiAssistant({
      action: "AI 确认执行完成",
      summary: `用户确认后执行 ${input.toolName}`,
      input: "用户点击确认卡片",
      plan,
      status: execution.status,
      result: execution.status === "needs_confirmation" ? execution.pendingAction : execution.result,
    });
    return execution;
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认执行失败";
    await auditAiAssistant({
      action: "AI 确认执行失败",
      summary: `${input.toolName} 确认执行失败：${message}`,
      input: "用户点击确认卡片",
      plan,
      status: "failed",
      error: message,
    });
    throw error;
  }
}
