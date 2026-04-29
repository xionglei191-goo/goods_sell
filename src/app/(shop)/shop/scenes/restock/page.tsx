import Link from "next/link";

import { ScenarioInquiryForm } from "@/features/channel/ScenarioInquiryForm";
import { AlcoholComplianceNotice } from "@/features/shop/AlcoholComplianceNotice";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export default async function RestockScenePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const promoterCode = typeof params.ref === "string" ? params.ref : undefined;
  const initialValues = {
    budget: param(params, "budget") ?? "",
    notes: param(params, "notes") ?? "",
    fields: {
      storeType: param(params, "storeType") ?? "",
      hotCategories: param(params, "hotCategories") ?? "",
      cycle: param(params, "cycle") ?? "",
      priceSensitivity: param(params, "priceSensitivity") ?? "",
    },
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-emerald-700 p-6 text-white">
        <p className="text-sm text-white/75">门店补货助手</p>
        <h1 className="mt-2 text-3xl font-bold">烟酒店、小超市、餐饮店补货推荐</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">
          输入门店类型、畅销品类和补货周期，平台会沉淀为门店线索，后续由业务员或经销商给出补货组合。
        </p>
      </section>

      <AlcoholComplianceNotice />

      <ScenarioInquiryForm
        description="适合门店老板快速补货、了解新品、确认批发价和配送安排。"
        fields={[
          { key: "storeType", label: "门店类型", placeholder: "烟酒店/小超市/餐饮店/便利店" },
          { key: "hotCategories", label: "畅销品类", placeholder: "白酒/啤酒/饮料/休闲食品" },
          { key: "cycle", label: "补货周期", placeholder: "每周/半月/月度补货" },
          { key: "priceSensitivity", label: "价格偏好", placeholder: "更看重利润/周转/品牌" },
        ]}
        initialValues={initialValues}
        promoterCode={promoterCode}
        scene="RESTOCK"
        title="提交补货需求"
      />

      <Link className="inline-flex text-sm font-medium text-[#dc2626]" href="/shop">
        返回客户入口
      </Link>
    </div>
  );
}
