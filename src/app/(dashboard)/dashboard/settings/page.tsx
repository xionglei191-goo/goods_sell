import { Bot, MapPinned, Settings, ShieldCheck, Smartphone, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BusinessConfigForm } from "@/features/settings/BusinessConfigForm";
import { getSettingsData } from "@/features/settings/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getSettingsData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">系统设置</h1>
          <p className="mt-1 text-sm text-slate-500">业务参数、用户管理入口、集成配置状态和商城基础设置。</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/settings/users">
            <Users className="h-4 w-4" />
            用户管理
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <EntryCard icon={Users} label="用户管理" text="后台用户、角色、启停和重置密码" href="/dashboard/settings/users" />
        <EntryCard icon={Settings} label="业务参数" text="安全库存、账期、配送范围" href="#business" />
        <EntryCard icon={ShieldCheck} label="权限策略" text="设置与日志仅 ADMIN 可访问" href="/dashboard/logs" />
        <EntryCard icon={Smartphone} label="商城设置" text="前台名称、集成状态、运营参数" href="#integrations" />
      </section>

      <div id="business">
        <BusinessConfigForm configs={data.businessConfigs} />
      </div>

      <section id="integrations" className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-900">集成配置状态</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <IntegrationCard enabled={data.integrations.wechat.miniLoginConfigured || data.integrations.wechat.wechatPayConfigured} icon={Smartphone} label="微信生态" />
          <IntegrationCard enabled={data.integrations.ai} icon={Bot} label="AI 接口" />
          <IntegrationCard enabled={data.integrations.amap} icon={MapPinned} label="高德地图" />
          <IntegrationCard enabled={data.integrations.tax} icon={ShieldCheck} label="税控接口" mutedText="未配置时 Mock 开票" />
        </div>
      </section>
    </div>
  );
}

function EntryCard({ icon: Icon, label, text, href }: { icon: typeof Users; label: string; text: string; href: string }) {
  return (
    <Link className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md" href={href}>
      <Icon className="h-5 w-5 text-[#dc2626]" />
      <p className="mt-3 font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </Link>
  );
}

function IntegrationCard({ icon: Icon, label, enabled, mutedText }: { icon: typeof Users; label: string; enabled: boolean; mutedText?: string }) {
  return (
    <div className={enabled ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4" : "rounded-lg border border-amber-200 bg-amber-50 p-4"}>
      <Icon className={enabled ? "h-5 w-5 text-emerald-700" : "h-5 w-5 text-amber-700"} />
      <p className={enabled ? "mt-3 font-semibold text-emerald-900" : "mt-3 font-semibold text-amber-900"}>{label}</p>
      <p className="mt-1 text-sm text-slate-600">{enabled ? "已配置" : mutedText ?? "未配置"}</p>
    </div>
  );
}
