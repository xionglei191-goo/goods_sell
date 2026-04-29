import Link from "next/link";

export const dynamic = "force-dynamic";

const channelSteps = [
  "业务员或经销商生成专属推广码",
  "客户扫码进入宴席、团购、补货等场景",
  "平台记录线索来源和客户需求",
  "小单回流经销商，大单转公司或业务员报价",
];

export default function ShopChannelPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-stone-200">
        <p className="text-sm font-medium text-[#dc2626]">经销商/业务员入口</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">平台不抢小单，帮助渠道沉淀客户</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          业务员和经销商可通过专属二维码引导客户进入平台。附近小额订单优先由经销商承接，宴席、企业团购等大单由公司统筹报价。
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {channelSteps.map((step, index) => (
          <div className="rounded-lg bg-stone-50 p-4 ring-1 ring-stone-200" key={step}>
            <span className="text-xs font-semibold text-[#dc2626]">STEP {index + 1}</span>
            <p className="mt-2 text-sm font-medium leading-6 text-stone-900">{step}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded-lg bg-red-700 p-5 text-white shadow-sm transition hover:bg-red-800" href="/dealer/incoming">
          <p className="text-lg font-semibold">我是经销商</p>
          <p className="mt-2 text-sm text-white/80">查看待接订单和结算中心</p>
        </Link>
        <Link className="rounded-lg bg-stone-900 p-5 text-white shadow-sm transition hover:bg-black" href="/dashboard/promoters">
          <p className="text-lg font-semibold">我是业务员/管理员</p>
          <p className="mt-2 text-sm text-white/75">进入后台管理推广码和线索</p>
        </Link>
      </section>
    </div>
  );
}
