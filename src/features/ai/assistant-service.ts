import { planVerifiedQuickPrompt } from "@/features/ai/intent-templates";
import { recordAiPromptUsage, type AiPlanSource } from "@/features/ai/prompt-usage";
import { auditAiAssistant } from "@/features/ai/tools/audit";
import { getAiToolContext } from "@/features/ai/tools/context";
import { executeAiTool, getAvailableAiTools, AiToolError, preflightAiTool } from "@/features/ai/tools/executor";
import { buildClarificationResponse, planWithModelV2, rankAiToolsForMessage, repairModelPlan, type RankedAiTool } from "@/features/ai/tools/model-planner";
import { planAiToolCall, validateAiToolPlan } from "@/features/ai/tools/planner";
import type { AiAssistantCard, AiToolDefinition, AiToolPlan } from "@/features/ai/tools/types";

type AssistantResponse = {
  answer: string;
  card: AiAssistantCard | null;
  plan: AiToolPlan | null;
  planSource: AiPlanSource;
};

type AssistantRequest = {
  message: string;
  quickPromptId?: string;
  pathname?: string;
  onStatus?: (text: string) => void | Promise<void>;
};

function answerForExecution(execution: Awaited<ReturnType<typeof executeAiTool>>) {
  if (execution.status === "needs_confirmation") {
    return `${execution.pendingAction.summary}\n请确认后我再执行。`;
  }
  return execution.result.summary;
}

async function validateAssistantPlan(
  message: string,
  context: Awaited<ReturnType<typeof getAiToolContext>>,
  tools: readonly AiToolDefinition[],
  plan: AiToolPlan | null,
) {
  if (!plan) return { plan: null, corrected: false, error: "没有形成工具计划" };
  const tool = tools.find((item) => item.name === plan.toolName);
  if (!tool) return { plan: null, corrected: false, error: `当前角色不可使用工具 ${plan.toolName}` };

  const intentValidatedPlan = validateAiToolPlan(message, context, tools, plan);
  if (!intentValidatedPlan) return { plan: null, corrected: false, error: `计划 ${plan.toolName} 与用户意图不匹配` };

  const validatedTool = tools.find((item) => item.name === intentValidatedPlan.toolName);
  if (!validatedTool) return { plan: null, corrected: false, error: `当前角色不可使用工具 ${intentValidatedPlan.toolName}` };

  try {
    const preflight = await preflightAiTool(validatedTool, intentValidatedPlan.args, context);
    return {
      plan: { ...intentValidatedPlan, args: preflight.parsedInput as Record<string, unknown> },
      corrected: intentValidatedPlan.toolName !== plan.toolName,
      error: null,
    };
  } catch (error) {
    return {
      plan: null,
      corrected: intentValidatedPlan.toolName !== plan.toolName,
      error: error instanceof Error ? error.message : "工具预检失败",
    };
  }
}

function noPlanResponse(message: string, rankedTools: readonly RankedAiTool[], missingSlots: readonly string[], planSource: AiPlanSource, reason?: string): AssistantResponse {
  const clarification = buildClarificationResponse(message, rankedTools, missingSlots, reason);
  return {
    answer: clarification.answer,
    card: clarification.card,
    plan: null,
    planSource,
  };
}

export async function answerAssistantMessage(input: string | AssistantRequest): Promise<AssistantResponse> {
  const message = typeof input === "string" ? input : input.message;
  const quickPromptId = typeof input === "string" ? undefined : input.quickPromptId;
  const onStatus = typeof input === "string" ? undefined : input.onStatus;
  const context = await getAiToolContext();
  const tools = getAvailableAiTools(context);
  const rankedTools = rankAiToolsForMessage(message, context, tools);
  let plan: AiToolPlan | null = null;
  let source: AiPlanSource = "no_plan";
  let missingSlots: string[] = [];
  let lastPlanError: string | undefined;

  const emitStatus = async (text: string) => {
    await onStatus?.(text);
  };

  if (quickPromptId) {
    await emitStatus("正在验证固定词条...");
    plan = await planVerifiedQuickPrompt(quickPromptId, context, tools);
    source = plan ? "template" : "no_plan";
  } else {
    await emitStatus("正在筛选工具...");
    await emitStatus("正在规划参数...");
    const modelResult = await planWithModelV2(message, context, tools);
    missingSlots = modelResult.missingSlots;
    if (modelResult.plan) {
      await emitStatus("正在校验计划...");
      const validation = await validateAssistantPlan(message, context, tools, modelResult.plan);
      if (validation.plan) {
        plan = validation.plan;
        source = validation.corrected ? "correction" : "model";
      } else {
        lastPlanError = validation.error ?? modelResult.error;
        await emitStatus("正在修复计划...");
        const repairedResult = await repairModelPlan(message, context, tools, modelResult.plan, lastPlanError ?? "计划校验失败");
        missingSlots = repairedResult.missingSlots.length ? repairedResult.missingSlots : missingSlots;
        if (repairedResult.plan) {
          const repairedValidation = await validateAssistantPlan(message, context, tools, repairedResult.plan);
          if (repairedValidation.plan) {
            plan = repairedValidation.plan;
            source = "correction";
          } else {
            lastPlanError = repairedValidation.error ?? repairedResult.error ?? lastPlanError;
          }
        } else {
          lastPlanError = repairedResult.error ?? lastPlanError;
        }
      }
    } else {
      lastPlanError = modelResult.error;
    }

    if (!plan) {
      await emitStatus("正在尝试本地规则...");
      const heuristicPlan = planAiToolCall(message, context, tools);
      const heuristicValidation = await validateAssistantPlan(message, context, tools, heuristicPlan);
      if (heuristicValidation.plan) {
        plan = heuristicValidation.plan;
        source = "heuristic";
      } else {
        lastPlanError = heuristicValidation.error ?? lastPlanError;
      }
    }
  }

  if (!plan) {
    const response = noPlanResponse(message, rankedTools, missingSlots, source, lastPlanError);
    await auditAiAssistant({
      action: "AI 未命中工具",
      summary: `用户请求未命中可执行工具：${message.slice(0, 80)}`,
      input: message,
      status: "no_plan",
      result: response.card,
    });
    await recordAiPromptUsage({ context, input: message, source: "no_plan", status: "no_plan" });
    return response;
  }

  try {
    await emitStatus("正在调用工具...");
    const execution = await executeAiTool(plan.toolName, plan.args, context);
    await emitStatus(execution.status === "needs_confirmation" ? "正在生成确认卡..." : "正在整理结果...");
    const response: AssistantResponse = {
      answer: answerForExecution(execution),
      card: execution.card,
      plan,
      planSource: source,
    };
    await auditAiAssistant({
      action: execution.status === "needs_confirmation" ? "AI 生成确认卡片" : "AI 执行工具完成",
      summary: execution.status === "needs_confirmation" ? `AI 已为 ${plan.toolName} 生成确认卡片` : `AI 已执行 ${plan.toolName}`,
      input: message,
      plan,
      status: execution.status,
      result: execution.status === "needs_confirmation" ? execution.pendingAction : execution.result,
    });
    await recordAiPromptUsage({ context, input: message, source, toolName: plan.toolName, status: execution.status === "success" ? "success" : execution.status });
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
      await recordAiPromptUsage({ context, input: message, source, toolName: plan.toolName, status: "failed" });
      return {
        answer: error.message,
        card: {
          kind: "result",
          title: "无法执行",
          summary: error.message,
          details: [{ label: "原因", value: error.status === 403 ? "权限不足" : "参数或业务条件不满足" }],
        },
        plan,
        planSource: source,
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
    await recordAiPromptUsage({ context, input: message, source, toolName: plan.toolName, status: "error" });
    return {
      answer: messageText,
      card: {
        kind: "result",
        title: "执行失败",
        summary: messageText,
        details: [],
      },
      plan,
      planSource: source,
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
