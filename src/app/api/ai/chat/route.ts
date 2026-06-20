import { NextRequest } from "next/server";

import { answerCustomerQuestion, answerStatelessQuestion, canUseAiChat, getAiChatRole, getChatCustomerId } from "@/features/ai/chat-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encoderPayload(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const canUse = await canUseAiChat();
  if (!canUse) {
    return Response.json({ error: "请先登录后再使用 AI 客服" }, { status: 401 });
  }
  const role = await getAiChatRole();
  const customerId = await getChatCustomerId();

  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message) {
    return Response.json({ error: "请输入问题" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const result = customerId ? await answerCustomerQuestion(customerId, message) : { answer: await answerStatelessQuestion(message, role), suggestion: null };
        const { answer, suggestion } = result;
        const chars = Array.from(answer);
        for (const char of chars) {
          controller.enqueue(encoder.encode(encoderPayload("delta", { text: char })));
          await new Promise((resolve) => setTimeout(resolve, 12));
        }
        if (suggestion) {
          controller.enqueue(encoder.encode(encoderPayload("suggestion", { suggestion })));
        }
        controller.enqueue(encoder.encode(encoderPayload("done", { ok: true })));
      } catch {
        controller.enqueue(encoder.encode(encoderPayload("error", { message: "小启暂时开小差了，请稍后再试或联系人工客服。" })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
