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
    <section className="surface-panel p-5">
      <h2 className="font-semibold text-neutral-950">业务参数</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {configs.map((config) => (
          <label className="block rounded-md border p-3" key={config.key} style={{ borderColor: "var(--dashboard-line)" }}>
            <span className="block font-medium text-neutral-950">{config.label}</span>
            <span className="mt-1 block text-xs text-neutral-500">{config.description}</span>
            <input
              className="form-input mt-3"
              min={0}
              onChange={(event) => setValue(config.key, Number(event.target.value))}
              type="number"
              value={values[config.key] ?? 0}
            />
          </label>
        ))}
      </div>
      <Button className="mt-4 bg-orange-500 text-white hover:bg-orange-600" disabled={isPending} onClick={submit} type="button">
        <Save className="h-4 w-4" />
        保存参数
      </Button>
      {message ? <p className="mt-3 text-sm text-neutral-600">{message}</p> : null}
    </section>
  );
}
