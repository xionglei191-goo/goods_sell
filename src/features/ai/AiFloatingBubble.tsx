"use client";

import { Bot, ChevronDown, Loader2, Maximize2, Mic, Send, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { AppRole } from "@/features/auth/types";
import { cn } from "@/lib/utils";

type AiToolDetail = {
  label: string;
  value: string;
};

type AiPendingAction = {
  toolName: string;
  args: Record<string, unknown>;
  confirmationToken: string;
  riskLevel: "READ" | "DRAFT" | "WRITE" | "HIGH_RISK";
  title: string;
  summary: string;
  details: AiToolDetail[];
  confirmLabel: string;
  confirmTextRequired?: string;
};

type AiAssistantCard =
  | {
      kind: "result";
      title: string;
      summary: string;
      details: AiToolDetail[];
      href?: string;
    }
  | {
      kind: "confirmation";
      pendingAction: AiPendingAction;
    };

type AiPlannerDebug = {
  plannerVersion?: string;
  intentKind?: string;
  toolNames?: string[];
  confidence?: number;
  planSource?: string;
};

type BubbleMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  card?: AiAssistantCard;
  debug?: AiPlannerDebug;
};

type AiQuickPrompt = {
  id: string;
  label: string;
  text: string;
  toolName: string;
  riskLevel: "READ" | "DRAFT" | "WRITE" | "HIGH_RISK";
  verified?: true;
};

type AiFloatingBubbleProps = {
  className?: string;
  contextLabel?: string;
};

const roleLabels: Record<AppRole, string> = {
  ADMIN: "系统管理员",
  SALESPERSON: "销售",
  WAREHOUSE: "仓储",
  FINANCE: "财务",
  CONSUMER: "消费者",
  DEALER: "经销商",
};

const roleHints: Record<AppRole, string> = {
  ADMIN: "按管理员权限处理全局运营、配置和高风险代办",
  SALESPERSON: "按销售权限处理客户、线索、订单和业绩",
  WAREHOUSE: "按仓储权限处理库存、盘点、出入库和配送",
  FINANCE: "按财务权限处理收款、应收、对账和票据",
  CONSUMER: "按消费者权限处理商品、购物车、订单和优惠券",
  DEALER: "按经销商权限处理接单、履约、结算和门店库存",
};

function roleLabel(role: AppRole | null) {
  return role ? roleLabels[role] : "未登录";
}

function roleHint(role: AppRole | null) {
  return role ? roleHints[role] : "登录后会按账号角色自动切换可用能力";
}

function parseSseChunk(buffer: string) {
  const events = buffer.split("\n\n");
  return { complete: events.slice(0, -1), rest: events.at(-1) ?? "" };
}

function parseEvent(event: string) {
  const eventName = event.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? "message";
  const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) return null;
  return {
    eventName,
    data: JSON.parse(dataLine.slice(6)) as {
      text?: string;
      message?: string;
      card?: AiAssistantCard;
      planSource?: string;
      plannerVersion?: string;
      intentKind?: string;
      toolNames?: string[];
      confidence?: number;
      debug?: AiPlannerDebug;
    },
  };
}

function DebugLine({ debug }: { debug: AiPlannerDebug }) {
  const parts = [
    debug.plannerVersion?.toUpperCase(),
    debug.planSource,
    debug.intentKind,
    debug.toolNames?.length ? debug.toolNames.join(" + ") : undefined,
    typeof debug.confidence === "number" ? debug.confidence.toFixed(2) : undefined,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="mt-2 border-t border-stone-100 pt-1 text-[10px] leading-4 text-stone-400">{parts.join(" · ")}</div>;
}

function CardView({ card, onConfirm, isPending }: { card: AiAssistantCard; onConfirm: (action: AiPendingAction, confirmText: string) => void; isPending: boolean }) {
  const [confirmText, setConfirmText] = useState("");

  if (card.kind === "confirmation") {
    const action = card.pendingAction;
    const requiresText = Boolean(action.confirmTextRequired);
    const canConfirm = !requiresText || confirmText.trim() === action.confirmTextRequired;
    return (
      <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-[var(--dashboard-panel)] p-3 text-stone-900 shadow-sm ring-1 ring-amber-200">
        <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{action.title}</p>
        <p className="mt-1 break-words text-xs leading-5 text-stone-600 [overflow-wrap:anywhere]">{action.summary}</p>
        <div className="mt-3 grid gap-1.5">
          {action.details.map((detail) => (
            <div className="flex min-w-0 justify-between gap-3 text-xs" key={`${detail.label}-${detail.value}`}>
              <span className="shrink-0 text-stone-400">{detail.label}</span>
              <span className="min-w-0 break-words text-right font-medium text-stone-700 [overflow-wrap:anywhere]">{detail.value}</span>
            </div>
          ))}
        </div>
        {requiresText ? (
          <input
            className="mt-3 h-9 w-full rounded-md border border-amber-200 px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={`输入“${action.confirmTextRequired}”`}
            value={confirmText}
          />
        ) : null}
        <Button className="mt-3 h-9 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={!canConfirm || isPending} onClick={() => onConfirm(action, confirmText)} size="sm" type="button">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {action.confirmLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-[var(--dashboard-panel)] p-3 text-stone-900 shadow-sm ring-1 ring-stone-200">
      <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{card.title}</p>
      <p className="mt-1 break-words text-xs leading-5 text-stone-600 [overflow-wrap:anywhere]">{card.summary}</p>
      {card.details.length ? (
        <div className="mt-3 grid gap-1.5">
          {card.details.map((detail) => (
            <div className="flex min-w-0 justify-between gap-3 text-xs" key={`${detail.label}-${detail.value}`}>
              <span className="shrink-0 text-stone-400">{detail.label}</span>
              <span className="min-w-0 break-words text-right font-medium text-stone-700 [overflow-wrap:anywhere]">{detail.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {card.href ? (
        <a className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md bg-stone-900 px-3 text-xs font-medium text-white" href={card.href}>
          打开相关页面
        </a>
      ) : null}
    </div>
  );
}

export function AiFloatingBubble({ className, contextLabel = "AI 助手" }: AiFloatingBubbleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quickPrompts, setQuickPrompts] = useState<AiQuickPrompt[]>([]);
  const [currentRole, setCurrentRole] = useState<AppRole | null>(null);
  const [isPending, startTransition] = useTransition();
  const assistantIdRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/ai/quick-prompts", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { role?: AppRole | null; prompts?: AiQuickPrompt[] } | null) => {
        setCurrentRole(data?.role ?? null);
        setQuickPrompts(data?.prompts ?? []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCurrentRole(null);
        setQuickPrompts([]);
      });
    return () => controller.abort();
  }, [open]);

  function appendAssistantText(text: string) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, content: item.content + text } : item)));
  }

  function setAssistantText(text: string) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, content: item.content || text } : item)));
  }

  function replaceAssistantText(text: string) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, content: text } : item)));
  }

  function attachCard(card: AiAssistantCard) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, card } : item)));
  }

  function attachDebug(debug: AiPlannerDebug) {
    setMessages((current) => current.map((item) => (item.id === assistantIdRef.current ? { ...item, debug } : item)));
  }

  function send(question = input, quickPrompt?: AiQuickPrompt) {
    const content = question.trim();
    if (!content || isPending) return;
    setError(null);
    setInput("");
    const assistantId = `a-${Date.now()}`;
    assistantIdRef.current = assistantId;
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "USER", content }, { id: assistantId, role: "ASSISTANT", content: quickPrompt ? "正在验证固定词条..." : "正在筛选工具..." }]);

    startTransition(async () => {
      try {
        let hasAnswerStarted = false;
        const response = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, quickPromptId: quickPrompt?.id, pathname: window.location.pathname }),
        });
        if (!response.ok || !response.body) throw new Error("AI 助手暂时不可用");
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
            const parsedEvent = parseEvent(event);
            if (!parsedEvent) continue;
            if (parsedEvent.eventName === "status" && parsedEvent.data.text && !hasAnswerStarted) {
              replaceAssistantText(parsedEvent.data.text);
              continue;
            }
            if (parsedEvent.eventName === "card" && parsedEvent.data.card) {
              attachCard(parsedEvent.data.card);
              continue;
            }
            if (parsedEvent.eventName === "done") {
              const debug = parsedEvent.data.debug;
              if (debug) {
                attachDebug({ ...debug, planSource: parsedEvent.data.planSource ?? debug.planSource });
              }
              continue;
            }
            if (parsedEvent.eventName === "error" && parsedEvent.data.message) {
              setAssistantText(parsedEvent.data.message);
              setError(parsedEvent.data.message);
              continue;
            }
            if (parsedEvent.data.text) {
              if (!hasAnswerStarted) {
                replaceAssistantText("");
                hasAnswerStarted = true;
              }
              appendAssistantText(parsedEvent.data.text);
            }
            if (parsedEvent.data.message) setError(parsedEvent.data.message);
          }
        }
        if (!hasAnswerStarted) {
          replaceAssistantText("已处理完成。");
        } else {
          setAssistantText("已处理完成。");
        }
      } catch (err) {
        const messageText = err instanceof Error ? err.message : "AI 助手暂时不可用";
        setAssistantText(messageText);
        setError(messageText);
      }
    });
  }

  function confirmAction(action: AiPendingAction, confirmText: string) {
    if (isPending) return;
    const assistantId = `a-${Date.now()}`;
    assistantIdRef.current = assistantId;
    setMessages((current) => [...current, { id: assistantId, role: "ASSISTANT", content: "正在执行确认操作..." }]);
    startTransition(async () => {
      try {
        const response = await fetch("/api/ai/assistant/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolName: action.toolName, args: action.args, confirmText, confirmationToken: action.confirmationToken }),
        });
        const data = (await response.json()) as { error?: string; card?: AiAssistantCard; result?: { summary?: string } };
        if (!response.ok) throw new Error(data.error ?? "确认执行失败");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId ? { ...item, content: data.result?.summary ?? "操作已执行。", card: data.card } : item,
          ),
        );
        router.refresh();
      } catch (err) {
        setMessages((current) => current.map((item) => (item.id === assistantId ? { ...item, content: err instanceof Error ? err.message : "确认执行失败" } : item)));
      }
    });
  }

  if (!open) {
    return (
      <button
        aria-label="打开 AI 助手"
        className={cn("fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#dc2626] text-white shadow-lg shadow-red-900/20 transition hover:bg-[#b91c1c] md:bottom-6", className)}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Bot className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className={cn("fixed bottom-20 right-3 z-50 w-[calc(100vw-1.5rem)] max-w-[390px] overflow-hidden rounded-lg bg-[var(--dashboard-panel)] shadow-2xl ring-1 ring-stone-200 md:bottom-6", expanded ? "md:max-w-[520px]" : "", className)}>
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#dc2626]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-stone-950">{contextLabel}</p>
            <p className="truncate text-xs text-stone-500">{roleHint(currentRole)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden shrink-0 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-[#dc2626] sm:inline-flex">
            {roleLabel(currentRole)}
          </span>
          <Button aria-label="切换大小" className="h-8 w-8" onClick={() => setExpanded((value) => !value)} size="icon-sm" variant="ghost">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button aria-label="收起 AI 助手" className="h-8 w-8" onClick={() => setOpen(false)} size="icon-sm" variant="ghost">
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button aria-label="关闭 AI 助手" className="h-8 w-8" onClick={() => { setMessages([]); setOpen(false); }} size="icon-sm" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-h-[55vh] min-h-72 space-y-3 overflow-x-hidden overflow-y-auto bg-stone-50 px-3 py-4">
        {messages.length === 0 ? (
          <div className="rounded-lg bg-[var(--dashboard-panel)] p-3 text-sm text-stone-600 shadow-sm ring-1 ring-stone-200">
            <p className="font-semibold text-stone-950">直接说你要办什么</p>
            <p className="mt-1 text-xs leading-5">当前身份：{roleLabel(currentRole)}。查询类会直接返回，调价、下单、库存等操作会先给你确认。</p>
          </div>
        ) : null}
        {messages.map((message) => {
          const isUser = message.role === "USER";
          return (
            <div className={cn("flex", isUser ? "justify-end" : "justify-start")} key={message.id}>
              <div className={cn("min-w-0 max-w-[86%] break-words rounded-lg px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]", isUser ? "bg-stone-900 text-white" : "bg-[var(--dashboard-panel)] text-stone-800 shadow-sm ring-1 ring-stone-200")}>
                {message.content || "正在处理..."}
                {message.card ? <CardView card={message.card} isPending={isPending} onConfirm={confirmAction} /> : null}
                {message.debug ? <DebugLine debug={message.debug} /> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-stone-100 p-3">
        <div className="mb-2 flex flex-wrap gap-2 pb-1">
          {quickPrompts.map((prompt) => (
            <button className="max-w-full rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-red-50 hover:text-[#dc2626]" key={prompt.id} onClick={() => send(prompt.text, prompt)} title={prompt.text} type="button">
              {prompt.label}
            </button>
          ))}
        </div>
        {error ? <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        <div className="flex gap-2">
          <Button aria-label="语音输入预留" className="h-10 w-10 rounded-full" size="icon" type="button" variant="outline">
            <Mic className="h-4 w-4" />
          </Button>
          <input
            className="h-10 min-w-0 flex-1 rounded-full border border-stone-200 px-4 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder="例如：这个月李明业绩怎么样"
            value={input}
          />
          <Button className="h-10 rounded-full bg-[#dc2626] px-4 text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={() => send()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
