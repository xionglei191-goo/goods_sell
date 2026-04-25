"use client";

import { Bot, Send, UserRound } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
};

type AiChatClientProps = {
  initialMessages: ChatMessage[];
};

const quickQuestions = ["茅台多少钱？", "有什么推荐？", "怎么下单？", "配送多久？"];

function parseSseChunk(buffer: string) {
  const events = buffer.split("\n\n");
  const complete = events.slice(0, -1);
  const rest = events.at(-1) ?? "";
  return { complete, rest };
}

export function AiChatClient({ initialMessages }: AiChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const assistantIdRef = useRef("");

  function appendAssistantText(text: string) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, content: item.content + text } : item)));
  }

  function send(question = input) {
    const content = question.trim();
    if (!content || isPending) return;
    setError(null);
    setInput("");
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "USER", content };
    const assistantMessage: ChatMessage = { id: `a-${Date.now()}`, role: "ASSISTANT", content: "" };
    assistantIdRef.current = assistantMessage.id;
    setMessages((current) => [...current, userMessage, assistantMessage]);

    startTransition(async () => {
      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content }),
        });

        if (!response.ok || !response.body) {
          throw new Error("AI 客服暂时不可用");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseChunk(buffer);
          buffer = parsed.rest;
          for (const event of parsed.complete) {
            const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            const data = JSON.parse(dataLine.slice(6)) as { text?: string; message?: string };
            if (data.text) appendAssistantText(data.text);
            if (data.message) setError(data.message);
          }
        }
      } catch {
        setError("小启暂时开小差了，请稍后再试或联系人工客服。");
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col rounded-lg bg-white shadow-sm ring-1 ring-stone-200">
      <div className="border-b border-stone-100 px-4 py-3">
        <h1 className="text-xl font-bold text-stone-950">AI 客服小启</h1>
        <p className="mt-1 text-sm text-stone-500">产品、价格、配送、支付问题都可以问我</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="rounded-lg bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">欢迎来到华启商城，我是小启。</div>
        ) : null}
        {messages.map((message) => {
          const isUser = message.role === "USER";
          return (
            <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")} key={message.id}>
              {!isUser ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                  <Bot className="h-4 w-4" />
                </span>
              ) : null}
              <div className={cn("max-w-[78%] rounded-lg px-3 py-2 text-sm leading-6", isUser ? "bg-blue-600 text-white" : "bg-stone-100 text-stone-800")}>
                {message.content || "正在输入..."}
              </div>
              {isUser ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <UserRound className="h-4 w-4" />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-stone-100 p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {quickQuestions.map((question) => (
            <button className="shrink-0 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-[#dc2626]" key={question} onClick={() => send(question)} type="button">
              {question}
            </button>
          ))}
        </div>
        {error ? <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="flex gap-2">
          <input
            className="h-11 min-w-0 flex-1 rounded-full border border-stone-200 px-4 outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder="输入你的问题"
            value={input}
          />
          <Button className="h-11 rounded-full bg-[#dc2626] px-5 text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={() => send()}>
            <Send className="h-4 w-4" />
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
