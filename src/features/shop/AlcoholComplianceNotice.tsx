import { ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type AlcoholComplianceNoticeProps = {
  className?: string;
  compact?: boolean;
};

const noticeItems = [
  {
    title: "个人信息用途",
    text: "姓名、手机号、地址、预算、口味偏好等信息仅用于线索登记、询价报价、配送售后和必要回访，不用于无关用途。",
  },
  {
    title: "未成年人禁售",
    text: "酒类商品和酒类营销内容仅面向成年人，平台不向未成年人销售或推荐酒类商品。",
  },
  {
    title: "适度饮酒",
    text: "页面和 AI 建议不劝酒、不拼酒、不暗示保健或治疗功效，请理性选择并适量饮酒。",
  },
  {
    title: "广告边界",
    text: "推荐内容仅作选品和询价参考，最终价格、库存、配送、开票和活动资格以人工确认为准。",
  },
];

export function AlcoholComplianceNotice({ className, compact = false }: AlcoholComplianceNoticeProps) {
  return (
    <section
      aria-label="个人信息和酒类商品合规提示"
      className={cn("rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200", compact ? "p-3" : "", className)}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-semibold">个人信息与酒类商品合规提示</p>
          <p className={cn("mt-1 text-sm leading-6 text-amber-900", compact ? "text-xs leading-5" : "")}>
            提交手机号、地址、预算或口味偏好前，请先确认以下使用边界。
          </p>
        </div>
      </div>
      {compact ? (
        <ul className="mt-3 list-disc space-y-1 pl-9 text-xs leading-5 text-amber-900">
          {noticeItems.map((item) => (
            <li key={item.title}>
              <span className="font-semibold">{item.title}：</span>
              {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {noticeItems.map((item) => (
            <div className="rounded-md bg-white/65 p-3 ring-1 ring-amber-200/70" key={item.title}>
              <p className="text-sm font-semibold text-amber-950">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-amber-900">{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
