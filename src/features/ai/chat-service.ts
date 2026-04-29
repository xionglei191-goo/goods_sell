import { auth } from "@/auth";
import {
  buildChannelFallbackAnswer,
  buildChannelPromptAddon,
  buildChannelSuggestion,
  extractChannelIntent,
  type ChannelAiSuggestion,
} from "@/features/ai/channel-intent";
import { callAnthropicCompatible } from "@/features/ai/provider";
import { buildKnowledgePrompt, fallbackAnswer, retrieveKnowledge } from "@/features/ai/knowledge";
import { prisma } from "@/lib/prisma";

const systemPrompt = `你是华启酒饮数字渠道平台的 AI 选品与询价助手“小启”，专门服务湘潭地区的客户。
你可以回答关于产品信息、价格、配送、支付等业务问题，也可以做宴席配酒、企业团购/送礼、门店补货、新品试饮的初步需求梳理。
回答要简洁友好，使用口语化中文。
当问题涉及华启商城业务时，优先参考提供的业务资料；当资料不足时，可以基于常识说明不确定点，并提醒用户以页面信息或人工客服确认为准。
涉及酒类时，不向未成年人销售，不劝酒，不夸大功效，提醒适量饮酒。
不要把知识库当作唯一回答范围，用户是在测试真实 AI 能力时也要正常发挥。`;

export async function getChatCustomerId() {
  const session = await auth();
  if (session?.user.id && session.user.role === "CONSUMER") {
    return session.user.id;
  }
  return null;
}

export async function getChatHistory(customerId: string) {
  return prisma.chatHistory.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
}

export async function answerCustomerQuestion(customerId: string, question: string): Promise<{ answer: string; suggestion: ChannelAiSuggestion | null }> {
  const hits = await retrieveKnowledge(question);
  const knowledge = buildKnowledgePrompt(hits);
  const extraction = extractChannelIntent(question, hits);
  const channelPrompt = extraction ? buildChannelPromptAddon(extraction) : "";
  const suggestion = extraction ? buildChannelSuggestion(extraction) : null;
  const recentHistory = await prisma.chatHistory.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const messages = [
    ...recentHistory
      .reverse()
      .filter((item) => item.role !== "SYSTEM")
      .map((item) => ({ role: item.role === "USER" ? ("user" as const) : ("assistant" as const), content: item.content })),
    {
      role: "user" as const,
      content: `业务参考资料：\n${knowledge}${channelPrompt}\n\n用户问题：${question}`,
    },
  ];

  await prisma.chatHistory.create({
    data: {
      customerId,
      role: "USER",
      content: question,
      metadata: { knowledgeHits: hits.map((hit) => hit.title), channelExtraction: extraction },
    },
  });

  let answer: string;
  try {
    answer = await callAnthropicCompatible({ system: systemPrompt, messages });
  } catch {
    answer = extraction ? buildChannelFallbackAnswer(extraction, hits) : fallbackAnswer(question, hits);
  }

  await prisma.chatHistory.create({
    data: {
      customerId,
      role: "ASSISTANT",
      content: answer,
      metadata: { source: extraction ? "channel-intent" : "rag", knowledgeHits: hits.map((hit) => hit.title), channelSuggestion: suggestion },
    },
  });

  return { answer, suggestion };
}
