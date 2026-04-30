"use client";

import { ArrowRight, Bot, Gift, PartyPopper, Send, Sparkles, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ChannelAiSuggestion } from "@/features/ai/channel-intent";
import { AlcoholComplianceNotice } from "@/features/shop/AlcoholComplianceNotice";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
};

type AiChatClientProps = {
  initialMessages: ChatMessage[];
};

const quickQuestions = [
  { label: "宴席预算", value: "20桌婚宴，预算每桌600元，想配白酒、啤酒和饮料，怎么安排？", icon: PartyPopper },
  { label: "团购送礼", value: "公司端午礼盒100份，每份预算200元，需要开票，有什么组合建议？", icon: Gift },
  { label: "门店补货", value: "我是烟酒店，每周补货，想配白酒、啤酒、饮料，重视周转和利润，怎么选？", icon: Store },
  { label: "新品试饮", value: "我想参加新品试饮，平时喜欢低度、果味或清爽口感，适合哪些新品？", icon: Sparkles },
  { label: "配送多久", value: "湘潭配送多久？", icon: Send },
];

const scenePrompts = [
  {
    title: "宴席配酒",
    description: "桌数、预算、白酒/啤酒/饮料搭配",
    value: "我要办20桌婚宴，每桌预算600元，想配白酒、啤酒和饮料，请帮我先整理询价需求。",
    icon: PartyPopper,
  },
  {
    title: "企业团购/送礼",
    description: "份数、预算、包装、开票与配送批次",
    value: "公司要做端午员工福利礼盒100份，每份预算200元，需要开票和统一配送，请给我组合建议。",
    icon: Gift,
  },
  {
    title: "门店补货",
    description: "门店类型、畅销品类、周转和利润",
    value: "我是烟酒店，每周补货，想配高周转常备款和利润款，也想试一点新品，请帮我做补货建议。",
    icon: Store,
  },
  {
    title: "新品试饮",
    description: "口味偏好、试饮场景、后续新品推送",
    value: "我想参加新品试饮，喜欢低度、果味或清爽口感，主要用于朋友聚餐，请帮我登记试饮偏好。",
    icon: Sparkles,
  },
];

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
  const [suggestions, setSuggestions] = useState<Record<string, ChannelAiSuggestion>>({});
  const [isPending, startTransition] = useTransition();
  const assistantIdRef = useRef("");

  function appendAssistantText(text: string) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, content: item.content + text } : item)));
  }

  function setAssistantText(text: string) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, content: item.content || text } : item)));
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
            const eventName = event.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? "message";
            const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            const data = JSON.parse(dataLine.slice(6)) as { text?: string; message?: string; suggestion?: ChannelAiSuggestion };
            if (eventName === "suggestion" && data.suggestion) {
              setSuggestions((current) => ({ ...current, [assistantIdRef.current]: data.suggestion as ChannelAiSuggestion }));
              continue;
            }
            if (eventName === "error" && data.message) {
              setAssistantText(data.message);
              setError(data.message);
              continue;
            }
            if (data.text) appendAssistantText(data.text);
            if (data.message) setError(data.message);
          }
        }
        setAssistantText("已处理完成。");
      } catch {
        const messageText = "小启暂时开小差了，请稍后再试或联系人工客服。";
        setAssistantText(messageText);
        setError(messageText);
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col rounded-lg bg-white shadow-sm ring-1 ring-stone-200">
      <div className="border-b border-stone-100 px-4 py-3">
        <h1 className="text-xl font-bold text-stone-950">AI 选品与询价助手</h1>
        <p className="mt-1 text-sm text-stone-500">宴席配酒、企业团购、门店补货、新品试饮先由小启梳理需求</p>
      </div>

      <div className="px-4 pt-4">
        <AlcoholComplianceNotice compact />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="rounded-lg bg-stone-50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-[#dc2626]">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-stone-950">小启会先把需求整理成线索或询价草稿</p>
                <p className="mt-1 text-sm leading-6 text-stone-500">选择一个场景开始，也可以直接输入产品、价格、配送或支付问题。</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {scenePrompts.map((scene) => {
                const Icon = scene.icon;
                return (
                  <button
                    className="group rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 hover:ring-red-200"
                    key={scene.title}
                    onClick={() => send(scene.value)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                      <Icon className="h-4 w-4 text-[#dc2626]" />
                      {scene.title}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-stone-500">{scene.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
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
                {!isUser && suggestions[message.id] ? <SuggestionCard suggestion={suggestions[message.id]} /> : null}
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
          {quickQuestions.map((question) => {
            const Icon = question.icon;
            return (
            <button className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-[#dc2626]" key={question.label} onClick={() => send(question.value)} type="button">
              <Icon className="h-3.5 w-3.5" />
              {question.label}
            </button>
            );
          })}
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

function SuggestionCard({ suggestion }: { suggestion: ChannelAiSuggestion }) {
  return (
    <div className="mt-3 rounded-md bg-white p-3 text-stone-800 shadow-sm ring-1 ring-stone-200">
      <p className="font-semibold text-stone-950">{suggestion.title}</p>
      <p className="mt-1 text-xs leading-5 text-stone-500">{suggestion.summary}</p>
      {suggestion.details.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {suggestion.details.map((detail) => (
            <p className="flex justify-between gap-3 text-xs" key={`${detail.label}-${detail.value}`}>
              <span className="text-stone-400">{detail.label}</span>
              <span className="text-right font-medium text-stone-700">{detail.value}</span>
            </p>
          ))}
        </div>
      ) : null}
      {suggestion.missingFields.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-amber-700">还需补充：{suggestion.missingFields.join("、")}</p>
      ) : null}
      <Button asChild className="mt-3 h-9 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" size="sm">
        <Link href={suggestion.href}>
          提交询价
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
