import { getAiQuickPromptsForContext } from "@/features/ai/intent-templates";
import { AiAuthError, getAiToolContext } from "@/features/ai/tools/context";
import { getAvailableAiTools } from "@/features/ai/tools/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getAiToolContext();
    const tools = getAvailableAiTools(context);
    return Response.json({ role: context.role, prompts: getAiQuickPromptsForContext(context, tools) });
  } catch (error) {
    if (error instanceof AiAuthError) {
      return Response.json({ role: null, prompts: [] });
    }
    const message = error instanceof Error ? error.message : "AI 固定词条暂时不可用";
    return Response.json({ error: message, prompts: [] }, { status: 500 });
  }
}
