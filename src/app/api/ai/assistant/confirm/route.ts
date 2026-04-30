import { NextRequest } from "next/server";

import { confirmAssistantTool } from "@/features/ai/assistant-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { toolName?: string; args?: Record<string, unknown>; confirmText?: string; confirmationToken?: string } | null;
  try {
    const result = await confirmAssistantTool({
      toolName: body?.toolName,
      args: body?.args,
      confirmText: body?.confirmText,
      confirmationToken: body?.confirmationToken,
    });
    if (result.status === "needs_confirmation") {
      return Response.json({ status: result.status, card: result.card, pendingAction: result.pendingAction });
    }
    return Response.json({ status: result.status, result: result.result, card: result.card });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 500;
    const message = error instanceof Error ? error.message : "确认执行失败";
    return Response.json({ error: message }, { status });
  }
}
