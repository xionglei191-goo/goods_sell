import { planVerifiedQuickPrompt } from "@/features/ai/intent-templates";
import { recordAiPromptUsage, type AiPlanSource } from "@/features/ai/prompt-usage";
import { auditAiAssistant } from "@/features/ai/tools/audit";
import { getAiToolContext } from "@/features/ai/tools/context";
import { executeAiTool, getAvailableAiTools, AiToolError, preflightAiTool } from "@/features/ai/tools/executor";
import {
  buildClarificationResponse,
  planAgentCapabilityNavigation,
  planRankedReadToolFallback,
  planWithModelV2,
  rankAiToolsForMessage,
  repairModelPlan,
  type RankedAiTool,
} from "@/features/ai/tools/model-planner";
import {
  composeAssistantAnswer,
  planWithModelV3,
  repairModelPlanV3,
  type AiIntentFrame,
  type AiPlannerTrace,
  type AiToolStep,
} from "@/features/ai/tools/model-planner-v3";
import { planAiToolCall, validateAiToolPlan } from "@/features/ai/tools/planner";
import type { AiAssistantCard, AiToolDefinition, AiToolPlan, AiToolResult } from "@/features/ai/tools/types";

type AssistantPlannerVersion = "v2" | "v3";

type AssistantPlannerDebug = {
  plannerVersion?: AssistantPlannerVersion;
  intentKind?: string;
  toolNames?: string[];
  confidence?: number;
  planSource?: AiPlanSource;
  candidates?: Array<{ name: string; score: number; reasons: string[] }>;
};

type AssistantResponse = {
  answer: string;
  card: AiAssistantCard | null;
  plan: AiToolPlan | null;
  planSource: AiPlanSource;
  plannerVersion?: AssistantPlannerVersion;
  intentKind?: string;
  toolNames?: string[];
  confidence?: number;
  debug?: AssistantPlannerDebug;
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

function resultCard(result: AiToolResult): AiAssistantCard {
  return {
    kind: "result",
    title: result.title,
    summary: result.summary,
    details: result.details ?? [],
    href: result.href,
  };
}

function combineReadResults(results: Array<{ toolName: string; result: AiToolResult }>): AiToolResult {
  const details = results.flatMap((item) => {
    const prefix = item.result.title || item.toolName;
    return (item.result.details ?? []).slice(0, 8).map((detail) => ({
      label: `${prefix} · ${detail.label}`,
      value: detail.value,
    }));
  });

  return {
    title: results.length > 1 ? "综合查询结果" : (results[0]?.result.title ?? "查询结果"),
    summary: results.map((item) => item.result.summary).filter(Boolean).join("\n") || "查询已完成。",
    details: details.slice(0, 16),
    href: results.find((item) => item.result.href)?.result.href,
    data: results.map((item) => ({ toolName: item.toolName, data: item.result.data ?? null })),
  };
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

async function validateAssistantSteps(
  message: string,
  context: Awaited<ReturnType<typeof getAiToolContext>>,
  tools: readonly AiToolDefinition[],
  steps: readonly AiToolStep[],
) {
  if (!steps.length) return { plan: null, steps: [], corrected: false, error: "没有形成工具步骤" };

  if (steps.length === 1) {
    const step = steps[0];
    const validation = await validateAssistantPlan(message, context, tools, {
      toolName: step.toolName,
      args: step.args,
      reason: step.reason,
      intent: step.intent,
      confidence: step.confidence,
    });
    return {
      plan: validation.plan,
      steps: validation.plan ? [validation.plan] : [],
      corrected: validation.corrected,
      error: validation.error,
    };
  }

  const validatedSteps: AiToolPlan[] = [];
  for (const step of steps) {
    const tool = tools.find((item) => item.name === step.toolName);
    if (!tool) return { plan: null, steps: [], corrected: false, error: `当前角色不可使用工具 ${step.toolName}` };
    if (tool.riskLevel !== "READ") return { plan: null, steps: [], corrected: false, error: "多步骤计划只能包含查询类工具" };
    if (tool.name === "navigate_to_feature" || tool.name === "feature_help") {
      return { plan: null, steps: [], corrected: false, error: "多步骤业务查询不能包含页面导航工具" };
    }

    const intentValidatedPlan = validateAiToolPlan(message, context, tools, {
      toolName: step.toolName,
      args: step.args,
      reason: step.reason,
      intent: step.intent,
      confidence: step.confidence,
    });
    if (!intentValidatedPlan || intentValidatedPlan.toolName !== step.toolName) {
      return { plan: null, steps: [], corrected: false, error: `多步骤计划 ${step.toolName} 与用户意图不匹配` };
    }

    try {
      const preflight = await preflightAiTool(tool, intentValidatedPlan.args, context);
      validatedSteps.push({ ...intentValidatedPlan, args: preflight.parsedInput as Record<string, unknown> });
    } catch (error) {
      return {
        plan: null,
        steps: [],
        corrected: false,
        error: error instanceof Error ? error.message : "工具预检失败",
      };
    }
  }

  return { plan: validatedSteps[0] ?? null, steps: validatedSteps, corrected: false, error: null };
}

function noPlanResponse(
  message: string,
  rankedTools: readonly RankedAiTool[],
  missingSlots: readonly string[],
  planSource: AiPlanSource,
  reason?: string,
  meta: Partial<AssistantResponse> = {},
): AssistantResponse {
  const clarification = buildClarificationResponse(message, rankedTools, missingSlots, reason);
  return {
    answer: clarification.answer,
    card: clarification.card,
    plan: null,
    planSource,
    ...meta,
  };
}

function buildPlannerMeta(params: {
  role: string;
  plannerVersion?: AssistantPlannerVersion;
  intentFrame?: AiIntentFrame | null;
  plan?: AiToolPlan | null;
  steps: readonly AiToolPlan[];
  source: AiPlanSource;
  rankedTools?: readonly RankedAiTool[];
}): Partial<AssistantResponse> {
  const toolNames = params.steps.length ? params.steps.map((step) => step.toolName) : params.plan ? [params.plan.toolName] : [];
  const confidence = params.intentFrame?.confidence ?? params.plan?.confidence;
  const meta = {
    plannerVersion: params.plannerVersion,
    intentKind: params.intentFrame?.intentKind,
    toolNames,
    confidence,
  };

  return {
    ...meta,
    debug: params.role === "ADMIN"
      ? {
          ...meta,
          planSource: params.source,
          candidates: params.rankedTools?.slice(0, 12).map((item) => ({
            name: item.tool.name,
            score: Number(item.score.toFixed(2)),
            reasons: item.reasons,
          })),
        }
      : undefined,
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
  let steps: AiToolPlan[] = [];
  let plannerVersion: AssistantPlannerVersion = "v2";
  let intentFrame: AiIntentFrame | null = null;

  const emitStatus = async (text: string) => {
    await onStatus?.(text);
  };

  if (quickPromptId) {
    await emitStatus("正在验证固定词条...");
    plan = await planVerifiedQuickPrompt(quickPromptId, context, tools);
    source = plan ? "template" : "no_plan";
    steps = plan ? [plan] : [];
  } else {
    await emitStatus("正在理解意图...");
    const modelV3Result = await planWithModelV3(message, context, tools);
    missingSlots = modelV3Result.missingSlots;
    lastPlanError = modelV3Result.error;
    if (modelV3Result.intentFrame) {
      intentFrame = modelV3Result.intentFrame;
    }

    if (modelV3Result.plan || modelV3Result.steps.length) {
      await emitStatus("正在抽取对象...");
      await emitStatus("正在编排工具...");
      await emitStatus("正在校验计划...");
      const v3Validation = await validateAssistantSteps(message, context, tools, modelV3Result.steps);
      if (v3Validation.plan) {
        plan = v3Validation.plan;
        steps = v3Validation.steps;
        source = v3Validation.corrected ? "correction" : "model";
        plannerVersion = "v3";
      } else {
        lastPlanError = v3Validation.error ?? modelV3Result.error ?? lastPlanError;
      }
    }

    if (!plan && !missingSlots.length) {
      await emitStatus("正在修复计划...");
      const repairedV3Result = await repairModelPlanV3(message, context, tools, modelV3Result, lastPlanError ?? "V3 计划校验失败");
      missingSlots = repairedV3Result.missingSlots.length ? repairedV3Result.missingSlots : missingSlots;
      if (repairedV3Result.intentFrame) {
        intentFrame = repairedV3Result.intentFrame;
      }
      if (repairedV3Result.plan || repairedV3Result.steps.length) {
        await emitStatus("正在校验计划...");
        const repairedV3Validation = await validateAssistantSteps(message, context, tools, repairedV3Result.steps);
        if (repairedV3Validation.plan) {
          plan = repairedV3Validation.plan;
          steps = repairedV3Validation.steps;
          source = "correction";
          plannerVersion = "v3";
        } else {
          lastPlanError = repairedV3Validation.error ?? repairedV3Result.error ?? lastPlanError;
        }
      } else {
        lastPlanError = repairedV3Result.error ?? lastPlanError;
      }
    }

    if (!plan) {
      await emitStatus("正在筛选工具...");
      await emitStatus("正在规划参数...");
      const modelResult = await planWithModelV2(message, context, tools);
      missingSlots = modelResult.missingSlots;
      if (modelResult.plan) {
        await emitStatus("正在校验计划...");
        const validation = await validateAssistantPlan(message, context, tools, modelResult.plan);
        if (validation.plan) {
          plan = validation.plan;
          steps = [validation.plan];
          source = validation.corrected ? "correction" : "model";
          plannerVersion = "v2";
        } else {
          lastPlanError = validation.error ?? modelResult.error;
          await emitStatus("正在修复计划...");
          const repairedResult = await repairModelPlan(message, context, tools, modelResult.plan, lastPlanError ?? "计划校验失败");
          missingSlots = repairedResult.missingSlots.length ? repairedResult.missingSlots : missingSlots;
          if (repairedResult.plan) {
            const repairedValidation = await validateAssistantPlan(message, context, tools, repairedResult.plan);
            if (repairedValidation.plan) {
              plan = repairedValidation.plan;
              steps = [repairedValidation.plan];
              source = "correction";
              plannerVersion = "v2";
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
    }

    if (!plan) {
      await emitStatus("正在尝试本地规则...");
      const heuristicPlan = planAiToolCall(message, context, tools);
      const heuristicValidation = await validateAssistantPlan(message, context, tools, heuristicPlan);
      if (heuristicValidation.plan) {
        plan = heuristicValidation.plan;
        steps = [heuristicValidation.plan];
        source = "heuristic";
        plannerVersion = "v2";
      } else {
        lastPlanError = heuristicValidation.error ?? lastPlanError;
      }
    }

    if (!plan) {
      await emitStatus("正在进行语义查询匹配...");
      const semanticReadPlan = planRankedReadToolFallback(message, context, tools);
      const semanticReadValidation = await validateAssistantPlan(message, context, tools, semanticReadPlan);
      if (semanticReadValidation.plan) {
        plan = semanticReadValidation.plan;
        steps = [semanticReadValidation.plan];
        source = "heuristic";
        plannerVersion = "v2";
      } else {
        lastPlanError = semanticReadValidation.error ?? lastPlanError;
      }
    }

    if (!plan) {
      await emitStatus("正在匹配全站功能...");
      const capabilityPlan = planAgentCapabilityNavigation(message, context, tools);
      const capabilityValidation = await validateAssistantPlan(message, context, tools, capabilityPlan);
      if (capabilityValidation.plan) {
        plan = capabilityValidation.plan;
        steps = [capabilityValidation.plan];
        source = "heuristic";
        plannerVersion = "v2";
      } else {
        lastPlanError = capabilityValidation.error ?? lastPlanError;
      }
    }
  }

  if (!plan) {
    const meta = buildPlannerMeta({ role: context.role, plannerVersion, intentFrame, plan, steps, source, rankedTools });
    const response = noPlanResponse(message, rankedTools, missingSlots, source, lastPlanError, meta);
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

  if (!steps.length) {
    steps = [plan];
  }

  const meta = buildPlannerMeta({ role: context.role, plannerVersion, intentFrame, plan, steps, source, rankedTools });
  const trace: AiPlannerTrace = {
    plannerVersion,
    intentKind: intentFrame?.intentKind,
    toolNames: steps.map((step) => step.toolName),
    confidence: intentFrame?.confidence ?? plan.confidence,
  };

  try {
    if (steps.length > 1) {
      await emitStatus("正在执行查询...");
      const results: Array<{ toolName: string; result: AiToolResult }> = [];
      for (const step of steps) {
        const execution = await executeAiTool(step.toolName, step.args, context);
        if (execution.status !== "success") {
          throw new AiToolError("多步骤查询不能包含需要确认的操作", 400);
        }
        results.push({ toolName: step.toolName, result: execution.result });
      }
      const combinedResult = combineReadResults(results);
      await emitStatus("正在总结结果...");
      const composedAnswer = await composeAssistantAnswer({ message, context, trace, results });
      const response: AssistantResponse = {
        answer: composedAnswer ?? combinedResult.summary,
        card: resultCard(combinedResult),
        plan,
        planSource: source,
        ...meta,
      };
      await auditAiAssistant({
        action: "AI 执行多工具完成",
        summary: `AI 已执行 ${steps.length} 个查询工具：${trace.toolNames.join("、")}`,
        input: message,
        plan,
        status: "success",
        result: combinedResult,
      });
      await recordAiPromptUsage({ context, input: message, source, toolName: trace.toolNames.join("+"), status: "success" });
      return response;
    }

    const [singleStep] = steps;
    const selectedTool = tools.find((item) => item.name === singleStep.toolName);
    await emitStatus(selectedTool?.riskLevel === "READ" ? "正在执行查询..." : "正在调用工具...");
    const execution = await executeAiTool(singleStep.toolName, singleStep.args, context);
    await emitStatus(execution.status === "needs_confirmation" ? "正在生成确认卡..." : selectedTool?.riskLevel === "READ" ? "正在总结结果..." : "正在整理结果...");
    const composedAnswer =
      execution.status === "success" && selectedTool?.riskLevel === "READ"
        ? await composeAssistantAnswer({ message, context, trace, results: [{ toolName: singleStep.toolName, result: execution.result }] })
        : null;
    const response: AssistantResponse = {
      answer: composedAnswer ?? answerForExecution(execution),
      card: execution.card,
      plan,
      planSource: source,
      ...meta,
    };
    await auditAiAssistant({
      action: execution.status === "needs_confirmation" ? "AI 生成确认卡片" : "AI 执行工具完成",
      summary: execution.status === "needs_confirmation" ? `AI 已为 ${singleStep.toolName} 生成确认卡片` : `AI 已执行 ${singleStep.toolName}`,
      input: message,
      plan,
      status: execution.status,
      result: execution.status === "needs_confirmation" ? execution.pendingAction : execution.result,
    });
    await recordAiPromptUsage({ context, input: message, source, toolName: singleStep.toolName, status: execution.status === "success" ? "success" : execution.status });
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
        ...meta,
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
      ...meta,
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
