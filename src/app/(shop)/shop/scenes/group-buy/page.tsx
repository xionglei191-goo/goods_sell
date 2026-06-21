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

export default async function GroupBuyScenePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const promoterCode = typeof params.ref === "string" ? params.ref : undefined;
  const initialValues = {
    budget: param(params, "budget") ?? "",
    notes: param(params, "notes") ?? "",
    fields: {
      company: param(params, "company") ?? "",
      recipient: param(params, "recipient") ?? "",
      quantity: param(params, "quantity") ?? "",
      packageNeed: param(params, "packageNeed") ?? "",
    },
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-orange-200 bg-[linear-gradient(135deg,#fff4e8_0%,#ffe1c2_54%,#ff9b2f_100%)] p-6 shadow-[var(--surface-raised-shadow)]">
        <p className="inline-flex rounded-full bg-[#dc2626]/10 px-3 py-1 text-sm font-semibold text-[#b91c1c]">企业团购与送礼</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold text-[#4a130c]">福利采购、节礼和商务送礼询价</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#7a3a25]">
          面向企业福利、节日礼盒、商务拜访和单位采购，先记录预算、包装、开票和配送批次，再由公司统一报价。
        </p>
      </section>

      <AlcoholComplianceNotice />

      <ScenarioInquiryForm
        description="适合需要开票、分批配送、礼盒组合或对公采购的订单。"
        fields={[
          { key: "company", label: "单位", placeholder: "采购单位或门店名称" },
          { key: "recipient", label: "对象", placeholder: "员工福利/客户礼品/商务拜访" },
          { key: "quantity", label: "数量", placeholder: "预计份数或箱数" },
          { key: "packageNeed", label: "包装", placeholder: "礼盒、手提袋、普通整箱等" },
        ]}
        initialValues={initialValues}
        promoterCode={promoterCode}
        scene="GROUP_BUY"
        title="提交团购需求"
      />

      <Link className="inline-flex text-sm font-medium text-[#dc2626]" href="/shop">
        返回客户入口
      </Link>
    </div>
  );
}
