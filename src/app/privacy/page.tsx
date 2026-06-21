import Link from "next/link";

const sections = [
  {
    title: "我们收集的信息",
    content: "为完成注册、登录、下单、配送、售后、经销商审核、客户服务和安全审计，平台会处理姓名、手机号、地址、订单、支付状态、发票信息、门店资料、操作日志和 AI 助手对话相关业务记录。",
  },
  {
    title: "信息使用目的",
    content: "上述信息仅用于身份识别、商品交易、配送履约、售后联系、经销商审核、账务核对、风险控制、权限管理、运营统计和依法配合监管要求，不会用于与业务无关的目的。",
  },
  {
    title: "角色权限与可见范围",
    content: "平台按管理员、销售、仓管、财务、消费者、经销商等角色限制数据访问。销售仅查看授权客户，仓管以库存履约为主，财务以收付款和发票为主，经销商仅查看与自身门店相关的订单、库存和结算。",
  },
  {
    title: "AI 助手数据处理",
    content: "AI 助手会根据当前登录用户权限调用业务工具。涉及客户隐私、财务、库存或高风险写操作时，系统会按权限过滤、确认卡和审计日志进行控制，并对密钥、密码、token 等敏感字段脱敏。",
  },
  {
    title: "用户权利",
    content: "用户可在账号页维护个人资料和地址，也可联系平台处理信息更正、账号停用、授权撤回、订单售后和经销商申请资料更新。依法必须保留的交易、票据和审计记录会按合规要求留存。",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fff8f6] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-md border border-orange-100 bg-[#fff8f3] p-6 shadow-sm sm:p-8">
        <div className="mb-8">
          <Link className="text-sm font-medium text-red-700 hover:underline" href="/shop">
            返回商城
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-neutral-950">华启商城隐私政策</h1>
          <p className="mt-2 text-sm text-neutral-500">说明平台如何在商城、经销商端、后台和 AI 助手中处理个人信息与业务数据。</p>
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
          本页面为上线前内置基础隐私文本，正式公开上线前仍需根据经营主体、第三方服务商、微信生态、支付、税控和数据留存政策完成法务复核。
        </p>
      </article>
    </main>
  );
}
