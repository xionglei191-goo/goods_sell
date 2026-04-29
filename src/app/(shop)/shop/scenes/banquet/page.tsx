import Link from "next/link";

import { ScenarioInquiryForm } from "@/features/channel/ScenarioInquiryForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export default async function BanquetScenePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const promoterCode = typeof params.ref === "string" ? params.ref : undefined;
  const initialValues = {
    budget: param(params, "budget") ?? "",
    notes: param(params, "notes") ?? "",
    fields: {
      tables: param(params, "tables") ?? "",
      drinkMix: param(params, "drinkMix") ?? "",
      brandPreference: param(params, "brandPreference") ?? "",
      eventType: param(params, "eventType") ?? "",
    },
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-red-700 p-6 text-white">
        <p className="text-sm text-white/75">宴席配酒助手</p>
        <h1 className="mt-2 text-3xl font-bold">婚宴、寿宴、升学宴酒水预算</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">
          留下桌数、预算和品牌偏好后，平台会先生成询价单，由公司或对应业务员确认库存、报价、配送和开票方案。
        </p>
      </section>

      <ScenarioInquiryForm
        description="适合婚宴、寿宴、升学宴、乔迁宴等大额场景，先询价再报价，避免直接进入普通购物车支付。"
        fields={[
          { key: "tables", label: "桌数", placeholder: "预计桌数，如 20 桌" },
          { key: "drinkMix", label: "搭配", placeholder: "白酒/啤酒/饮料搭配需求" },
          { key: "brandPreference", label: "品牌偏好", placeholder: "偏好的品牌或价位" },
          { key: "eventType", label: "宴席类型", placeholder: "婚宴/寿宴/升学宴/乔迁宴" },
        ]}
        initialValues={initialValues}
        promoterCode={promoterCode}
        scene="BANQUET"
        title="提交宴席需求"
      />

      <Link className="inline-flex text-sm font-medium text-[#dc2626]" href="/shop">
        返回客户入口
      </Link>
    </div>
  );
}
