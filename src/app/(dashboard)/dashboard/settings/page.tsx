import { AlertTriangle, CheckCircle2, Settings, ShieldCheck, Smartphone, Users, XCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BusinessConfigForm } from "@/features/settings/BusinessConfigForm";
import { getSettingsData } from "@/features/settings/queries";
import type { LaunchReadinessItem, LaunchReadinessSeverity } from "@/features/system/launch-readiness";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getSettingsData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">系统设置</h1>
          <p className="mt-1 text-sm text-neutral-500">业务参数、用户管理、上线检查和正式环境集成状态。</p>
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
        <EntryCard icon={Smartphone} label="上线检查" text="正式上线配置、集成和合规资质" href="#launch-readiness" />
      </section>

      <LaunchReadinessPanel report={data.launchReadiness} />

      <div id="business">
        <BusinessConfigForm configs={data.businessConfigs} />
      </div>
    </div>
  );
}

function EntryCard({ icon: Icon, label, text, href }: { icon: typeof Users; label: string; text: string; href: string }) {
  return (
    <Link className="surface-panel p-4 transition-colors hover:border-neutral-300" href={href}>
      <Icon className="h-5 w-5 text-orange-700" />
      <p className="mt-3 font-semibold text-neutral-950">{label}</p>
      <p className="mt-1 text-sm text-neutral-500">{text}</p>
    </Link>
  );
}

function LaunchReadinessPanel({ report }: { report: Awaited<ReturnType<typeof getSettingsData>>["launchReadiness"] }) {
  const grouped = report.items.reduce<Record<string, LaunchReadinessItem[]>>((current, item) => {
    current[item.group] = [...(current[item.group] ?? []), item];
    return current;
  }, {});

  return (
    <section id="launch-readiness" className="surface-panel p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <StatusIcon severity={report.status} />
            <h2 className="font-semibold text-neutral-950">上线检查中心</h2>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            当前按正式公开上线口径检查；敏感密钥仅显示变量名，不显示实际值。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <SummaryPill label="已就绪" tone="ready" value={report.readyCount} />
          <SummaryPill label="提醒项" tone="warning" value={report.warningCount} />
          <SummaryPill label="阻塞项" tone="blocker" value={report.blockerCount} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1">模式：{modeLabel(report.mode)}</span>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1">
          检查时间：{new Date(report.checkedAt).toLocaleString("zh-CN", { hour12: false })}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {Object.entries(grouped).map(([group, items]) => (
          <div className="rounded-md border border-orange-100 bg-[#fff8f3] p-4" key={group}>
            <h3 className="text-sm font-semibold text-neutral-950">{group}</h3>
            <div className="mt-3 divide-y divide-orange-100">
              {items.map((item) => (
                <ReadinessRow item={item} key={item.key} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: "ready" | "warning" | "blocker" }) {
  const className =
    tone === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`rounded-md border px-4 py-2 ${className}`}>
      <p className="text-lg font-bold">{value}</p>
      <p>{label}</p>
    </div>
  );
}

function ReadinessRow({ item }: { item: LaunchReadinessItem }) {
  return (
    <div className="grid gap-3 py-3 lg:grid-cols-[220px_1fr_auto] lg:items-start">
      <div className="flex items-center gap-2">
        <StatusIcon severity={item.severity} />
        <div>
          <p className="font-medium text-neutral-950">{item.label}</p>
          <p className="text-xs text-neutral-500">{severityLabel(item.severity)}</p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <p className="text-neutral-700">{item.summary}</p>
        <p className="text-neutral-600">处理动作：{item.action}</p>
        <div className="flex flex-wrap gap-1">
          {item.variables.map((variable) => (
            <code className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-900" key={variable}>
              {variable}
            </code>
          ))}
        </div>
      </div>
      {item.href ? (
        <Button asChild className="w-fit bg-orange-500 text-white hover:bg-orange-600" size="sm">
          <Link href={item.href}>查看入口</Link>
        </Button>
      ) : null}
    </div>
  );
}

function StatusIcon({ severity }: { severity: LaunchReadinessSeverity }) {
  if (severity === "READY") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (severity === "WARNING") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  return <XCircle className="h-5 w-5 text-red-600" />;
}

function severityLabel(severity: LaunchReadinessSeverity) {
  if (severity === "READY") return "已配置";
  if (severity === "WARNING") return "可延期提醒";
  return "上线阻塞";
}

function modeLabel(mode: string) {
  if (mode === "trial") return "封闭试运营";
  if (mode === "demo") return "内部演示";
  return "正式公开上线";
}
