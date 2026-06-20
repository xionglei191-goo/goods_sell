import { AiChatClient } from "@/features/ai/AiChatClient";
import { getChatCustomerId, getChatHistory } from "@/features/ai/chat-service";

export const dynamic = "force-dynamic";

export default async function AiChatPage() {
  const customerId = await getChatCustomerId();
  const history = customerId ? await getChatHistory(customerId) : [];

  return (
    <AiChatClient
      initialMessages={history.map((item) => ({
        id: item.id,
        role: item.role === "USER" ? "USER" : "ASSISTANT",
        content: item.content,
      }))}
    />
  );
}
