import Link from "next/link";

const sections = [
  {
    title: "服务范围",
    content: "华启商城提供酒水、食品、饮料等商品浏览、下单、配送、售后、经销商申请和业务咨询服务。经销商工作台、后台管理和 AI 助手能力仅面向具备相应身份与权限的用户开放。",
  },
  {
    title: "账号与权限",
    content: "用户应保证注册信息真实、准确、完整。经销商申请需经过平台审核后方可使用经销商工作台。后台账号由管理员分配，用户不得转借、共享或绕过权限访问其他角色数据。",
  },
  {
    title: "商品与订单",
    content: "商品价格、库存、配送范围和促销信息以页面展示及订单确认为准。酒类商品不向未成年人销售，用户下单即确认本人已达到法定饮酒年龄并遵守适量饮酒提示。",
  },
  {
    title: "支付、发票与售后",
    content: "平台支持线上支付、转账、账期等业务约定方式。发票和税控能力需在正式配置完成后使用真实服务；未配置环境中的演示或测试结果不得作为真实交易凭证。",
  },
  {
    title: "AI 助手",
    content: "AI 助手用于商品、订单、库存、客户、经销商和运营事项的辅助查询或草拟操作。涉及写入或高风险操作时，系统会要求具备权限的用户再次确认，最终业务责任以实际确认和系统记录为准。",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fff8f6] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-md border border-orange-100 bg-[#fff8f3] p-6 shadow-sm sm:p-8">
        <div className="mb-8">
          <Link className="text-sm font-medium text-red-700 hover:underline" href="/shop">
            返回商城
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-neutral-950">华启商城服务协议</h1>
          <p className="mt-2 text-sm text-neutral-500">适用于消费者注册、经销商申请、商城下单、后台业务协同和 AI 助手使用。</p>
        </div>

        <div className="space-y-5">
          {sections.map((section) => (
            <section className="rounded-md border border-orange-100 bg-[#fffaf7] p-4" key={section.title}>
              <h2 className="font-semibold text-neutral-950">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{section.content}</p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-xs leading-5 text-neutral-500">
          本页面为上线前内置基础协议文本，正式公开上线前应由业务负责人和法务负责人结合主体资质、经营范围、支付服务商和税控服务商条款完成复核签收。
        </p>
      </article>
    </main>
  );
}
