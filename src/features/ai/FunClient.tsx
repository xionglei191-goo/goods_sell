"use client";

import { CheckCircle2, Share2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { checkInToday, submitPersonalityTest } from "@/features/ai/fun-actions";
import { personalityQuestions } from "@/features/ai/fun";

type FunClientProps = {
  checkIn: { checkedToday: boolean; recent: Array<{ date: string; points: number; streak: number }> } | null;
};

type Result = {
  title: string;
  category: string;
  description: string;
};

export function FunClient({ checkIn }: FunClientProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const done = Object.keys(answers).length === personalityQuestions.length;

  function submitTest() {
    startTransition(async () => {
      const response = await submitPersonalityTest(answers);
      if (!response.success) {
        setTestMessage(response.error.message);
        return;
      }
      setResult(response.data);
      setTestMessage(response.message ?? "测试完成");
    });
  }

  function signIn() {
    startTransition(async () => {
      const response = await checkInToday();
      setCheckInMessage(response.success ? `${response.message}，+${response.data.points}积分，连续${response.data.streak}天` : response.error.message);
    });
  }

  function share() {
    const text = result ? `我在华启商城测出：${result.title}` : "来华启商城测测你的酒水性格";
    if (navigator.share) {
      navigator.share({ title: "华启商城性格测试", text, url: window.location.href });
      return;
    }
    navigator.clipboard.writeText(`${text} ${window.location.href}`);
    setTestMessage("分享链接已复制");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <section className="shop-block-card p-5">
        <h2 className="text-xl font-bold text-neutral-950">你是什么酒的性格？</h2>
        <div className="mt-5 space-y-5">
          {personalityQuestions.map((question, index) => (
            <div key={question.id}>
              <p className="font-semibold text-neutral-950">{index + 1}. {question.question}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {question.options.map((option) => (
                  <button
                    className={answers[question.id] === option ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium commerce-accent" : "rounded-md border border-orange-100 bg-[#fff8f2] px-3 py-2 text-sm text-neutral-600 hover:bg-[#fff1e8]"}
                    key={option}
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button className="mt-5 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={!done || isPending} onClick={submitTest}>
          生成结果
        </Button>
        {testMessage ? <p className="mt-3 text-sm text-neutral-500">{testMessage}</p> : null}
        {result ? (
          <div className="mt-5 rounded-md border border-red-100 bg-red-50 p-4">
            <h3 className="text-lg font-bold commerce-accent">{result.title}</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{result.description}</p>
            <Button className="mt-3" onClick={share} variant="outline">
              <Share2 className="h-4 w-4" />
              分享结果
            </Button>
          </div>
        ) : null}
      </section>

      <aside className="space-y-4">
        <section className="shop-block-card p-5">
          <h2 className="text-lg font-bold text-neutral-950">每日签到</h2>
          <p className="mt-1 text-sm text-neutral-500">1天5分，连续7天50分，连续30天200分</p>
          <Button className="mt-4 h-11 w-full bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={Boolean(checkIn?.checkedToday) || isPending} onClick={signIn}>
            <CheckCircle2 className="h-4 w-4" />
            {checkIn?.checkedToday ? "今日已签到" : "立即签到"}
          </Button>
          {checkInMessage ? <p className="mt-3 text-sm text-neutral-500">{checkInMessage}</p> : null}
          <div className="mt-4 grid grid-cols-5 gap-2">
            {(checkIn?.recent ?? []).slice(0, 10).map((item) => (
              <div className="rounded-md bg-[#fff8f6] px-2 py-2 text-center text-xs" key={item.date}>
                <p className="font-semibold text-neutral-950">{item.streak}</p>
                <p className="text-neutral-400">+{item.points}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
