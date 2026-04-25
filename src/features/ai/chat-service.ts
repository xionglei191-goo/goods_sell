import { auth } from "@/auth";
import { callAnthropicCompatible } from "@/features/ai/provider";
import { buildKnowledgePrompt, fallbackAnswer, retrieveKnowledge } from "@/features/ai/knowledge";
import { prisma } from "@/lib/prisma";

const systemPrompt = `你是华启商城的AI客服助手“小启”，专门服务湘潭地区的客户。
你可以回答关于产品信息、价格、配送、支付等问题。
回答要简洁友好，使用口语化中文。
只能基于提供的知识库回答。若知识库中没有依据，必须建议用户联系人工客服。`;

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

export async function answerCustomerQuestion(customerId: string, question: string) {
  const hits = await retrieveKnowledge(question);
  const knowledge = buildKnowledgePrompt(hits);
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
      content: `知识库：\n${knowledge}\n\n用户问题：${question}`,
    },
  ];

  await prisma.chatHistory.create({
    data: {
      customerId,
      role: "USER",
      content: question,
      metadata: { knowledgeHits: hits.map((hit) => hit.title) },
    },
  });

  let answer: string;
  try {
    answer = await callAnthropicCompatible({ system: systemPrompt, messages });
  } catch {
    answer = fallbackAnswer(question, hits);
  }

  await prisma.chatHistory.create({
    data: {
      customerId,
      role: "ASSISTANT",
      content: answer,
      metadata: { source: "rag", knowledgeHits: hits.map((hit) => hit.title) },
    },
  });

  return answer;
}
