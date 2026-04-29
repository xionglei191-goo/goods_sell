"use client";

import type { LeadScene } from "@prisma/client";
import { CheckCircle2, Send } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createScenarioInquiry } from "@/features/channel/actions";

export type ScenarioField = {
  key: string;
  label: string;
  placeholder: string;
};

type ScenarioInquiryFormProps = {
  scene: LeadScene;
  title: string;
  description: string;
  fields: ScenarioField[];
  promoterCode?: string;
  initialValues?: {
    budget?: string;
    deliveryAddress?: string;
    notes?: string;
    fields?: Record<string, string>;
  };
};

export function ScenarioInquiryForm({ scene, title, description, fields, promoterCode, initialValues }: ScenarioInquiryFormProps) {
  const [base, setBase] = useState({
    contactName: "",
    contactPhone: "",
    budget: initialValues?.budget ?? "",
    expectedDate: "",
    deliveryAddress: initialValues?.deliveryAddress ?? "",
    notes: initialValues?.notes ?? "",
    needsInvoice: false,
    consentAccepted: false,
  });
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(initialValues?.fields ?? {});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || Boolean(message);
  const fieldMap = useMemo(() => Object.fromEntries(fields.map((field) => [field.key, fieldValues[field.key] ?? ""])), [fields, fieldValues]);

  function updateBase(key: keyof typeof base, value: string | boolean) {
    setBase((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createScenarioInquiry({
        scene,
        source: promoterCode ? "DEALER_CODE" : "SHOP",
        promoterCode,
        contactName: base.contactName,
        contactPhone: base.contactPhone,
        budget: base.budget,
        expectedDate: base.expectedDate,
        deliveryAddress: base.deliveryAddress,
        needsInvoice: base.needsInvoice,
        notes: base.notes,
        consentAccepted: base.consentAccepted,
        fields: fieldMap,
      });
      if (result.success) {
        setMessage(result.message ?? "需求已提交");
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div>
        <h2 className="text-xl font-bold text-stone-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <input className="form-input" disabled={disabled} onChange={(event) => updateBase("contactName", event.target.value)} placeholder="联系人姓名" value={base.contactName} />
        <input className="form-input" disabled={disabled} onChange={(event) => updateBase("contactPhone", event.target.value)} placeholder="手机号" value={base.contactPhone} />
        {fields.map((field) => (
          <input
            className="form-input"
            disabled={disabled}
            key={field.key}
            onChange={(event) => setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))}
            placeholder={field.placeholder}
            value={fieldValues[field.key] ?? ""}
          />
        ))}
        <input className="form-input" disabled={disabled} onChange={(event) => updateBase("budget", event.target.value)} placeholder="预算金额，可选" value={base.budget} />
        <input className="form-input" disabled={disabled} onChange={(event) => updateBase("expectedDate", event.target.value)} placeholder="期望时间，可选" type="date" value={base.expectedDate} />
        <input className="form-input sm:col-span-2" disabled={disabled} onChange={(event) => updateBase("deliveryAddress", event.target.value)} placeholder="配送地址或区域，可选" value={base.deliveryAddress} />
        <textarea
          className="min-h-24 rounded-md border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-300 sm:col-span-2"
          disabled={disabled}
          onChange={(event) => updateBase("notes", event.target.value)}
          placeholder="补充说明，如品牌偏好、开票要求、配送细节"
          value={base.notes}
        />
      </div>

      <div className="mt-4 space-y-3 text-sm text-stone-600">
        <label className="flex items-start gap-2">
          <input className="mt-1" checked={base.needsInvoice} disabled={disabled} onChange={(event) => updateBase("needsInvoice", event.target.checked)} type="checkbox" />
          <span>需要开票或对公采购支持</span>
        </label>
        <label className="flex items-start gap-2">
          <input className="mt-1" checked={base.consentAccepted} disabled={disabled} onChange={(event) => updateBase("consentAccepted", event.target.checked)} type="checkbox" />
          <span>
            我已阅读并同意本页合规提示，授权平台仅为线索登记、询价报价、配送售后和必要回访处理以上信息；本人为成年人，知悉酒类商品不面向未成年人销售，饮酒请适量。
          </span>
        </label>
      </div>

      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      ) : null}

      <Button className="mt-5 bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={disabled} onClick={submit} type="button">
        <Send className="h-4 w-4" />
        提交需求
      </Button>
    </section>
  );
}
