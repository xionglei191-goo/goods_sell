import { ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type AlcoholComplianceNoticeProps = {
  className?: string;
  compact?: boolean;
};

export function AlcoholComplianceNotice({ className, compact = false }: AlcoholComplianceNoticeProps) {
  return (
    <section className={cn("rounded-lg bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200", className)}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-semibold">酒类商品合规提示</p>
          <p className={cn("mt-1 text-sm leading-6", compact ? "text-xs leading-5" : "")}>
            本平台仅面向成年人，不向未成年人销售酒类商品。提交的信息仅用于询价、报价、配送和售后联系；饮酒请适量，AI 推荐不构成鼓励饮酒或医疗建议。
          </p>
        </div>
      </div>
    </section>
  );
}
