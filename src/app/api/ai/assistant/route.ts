import { NextRequest } from "next/server";

import { answerAssistantMessage } from "@/features/ai/assistant-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encoderPayload(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message) {
    return Response.json({ error: "请输入要让 AI 处理的事项" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const result = await answerAssistantMessage(message);
        for (const char of Array.from(result.answer)) {
          controller.enqueue(encoder.encode(encoderPayload("delta", { text: char })));
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
        if (result.card) {
          controller.enqueue(encoder.encode(encoderPayload("card", { card: result.card })));
        }
        controller.enqueue(encoder.encode(encoderPayload("done", { ok: true, plan: result.plan })));
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 500;
        const messageText = error instanceof Error ? error.message : "AI 助手暂时不可用";
        controller.enqueue(encoder.encode(encoderPayload("error", { message: messageText, status })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
