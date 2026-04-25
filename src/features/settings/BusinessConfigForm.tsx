"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { saveBusinessConfigs } from "@/features/settings/actions";

type BusinessConfig = {
  key: string;
  label: string;
  description: string;
  value: number;
};

export function BusinessConfigForm({ configs }: { configs: BusinessConfig[] }) {
  const [values, setValues] = useState(() => Object.fromEntries(configs.map((item) => [item.key, item.value])));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setValue(key: string, value: number) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveBusinessConfigs({ values });
      setMessage(result.success ? result.message ?? "已保存" : result.error.message);
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-semibold text-slate-900">业务参数</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {configs.map((config) => (
          <label className="block rounded-lg border border-slate-200 p-3" key={config.key}>
            <span className="block font-medium text-slate-900">{config.label}</span>
            <span className="mt-1 block text-xs text-slate-500">{config.description}</span>
            <input
              className="mt-3 h-10 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-red-300"
              min={0}
              onChange={(event) => setValue(config.key, Number(event.target.value))}
              type="number"
              value={values[config.key] ?? 0}
            />
          </label>
        ))}
      </div>
      <Button className="mt-4 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={submit} type="button">
        <Save className="h-4 w-4" />
        保存参数
      </Button>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
