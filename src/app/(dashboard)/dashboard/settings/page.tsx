import { AlertTriangle, CheckCircle2, ClipboardCheck, Settings, ShieldCheck, Smartphone, Users, XCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { BusinessConfigForm } from "@/features/settings/BusinessConfigForm";
import { getSettingsData } from "@/features/settings/queries";
import { permissionRoles, type DashboardPermission } from "@/features/auth/permissions";
import type { LaunchReadinessItem, LaunchReadinessSeverity } from "@/features/system/launch-readiness";
import type { OperationalAcceptanceItem, OperationalAcceptanceSeverity } from "@/features/system/operational-acceptance";
import type { SystemCompletenessItem, SystemCompletenessSeverity } from "@/features/system/system-completeness";

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

      <section className="grid gap-4 md:grid-cols-6">
        <EntryCard icon={Users} label="用户管理" text="后台用户、角色、启停和重置密码" href="/dashboard/settings/users" />
        <EntryCard icon={Settings} label="业务参数" text="安全库存、账期、配送范围" href="#business" />
        <EntryCard icon={ShieldCheck} label="权限策略" text="角色矩阵、敏感权限和越权检查" href="#permission-policy" />
        <EntryCard icon={Smartphone} label="硬配置检查" text="域名、微信、支付、税控和资质" href="#launch-readiness" />
        <EntryCard icon={ClipboardCheck} label="程序完整度" text="入口、操作、权限、审计和异常" href="#system-completeness" />
        <EntryCard icon={ClipboardCheck} label="运营验收" text="签收、真机、支付和备份演练" href="#operational-acceptance" />
      </section>

      <SystemCompletenessPanel report={data.systemCompleteness} />
      <OperationalAcceptancePanel report={data.operationalAcceptance} />
      <LaunchReadinessPanel report={data.launchReadiness} />
      <PermissionPolicyPanel />

      <div id="business">
        <BusinessConfigForm configs={data.businessConfigs} />
      </div>
    </div>
  );
}

const roleLabels = {
  ADMIN: "管理员",
  SALESPERSON: "销售员",
  WAREHOUSE: "仓管",
  FINANCE: "财务",
  CONSUMER: "消费者",
  DEALER: "经销商",
} as const;

const permissionMeta: Record<DashboardPermission, { label: string; risk: "HIGH" | "MEDIUM" | "LOW"; description: string }> = {
  "dashboard:view": { label: "后台首页", risk: "LOW", description: "查看后台工作台和经营入口。" },
  "products:view": { label: "商品查看", risk: "LOW", description: "查看商品列表、详情和基础库存。" },
  "products:write": { label: "商品维护", risk: "HIGH", description: "新增、编辑、上下架、维护分类品牌素材。" },
  "inventory:manage": { label: "库存管理", risk: "HIGH", description: "执行入库、出库、盘点和库存调整。" },
  "purchase:manage": { label: "采购供应商", risk: "MEDIUM", description: "维护采购单和供应商档案。" },
  "orders:view": { label: "订单查看", risk: "LOW", description: "查看订单列表、详情和履约状态。" },
  "orders:write": { label: "订单开单", risk: "HIGH", description: "后台手动开单、调整订单和确认客户要货。" },
  "orders:fulfill": { label: "订单履约", risk: "HIGH", description: "确认、发货、送达和完成订单。" },
  "customers:view": { label: "客户查看", risk: "MEDIUM", description: "查看客户档案、消费、欠款和归属数据。" },
  "dealers:view": { label: "经销商查看", risk: "MEDIUM", description: "查看经销商档案、范围、接单和结算信息。" },
  "dealers:approve": { label: "经销商审核", risk: "HIGH", description: "通过或驳回经销商入驻申请。" },
  "channel:manage": { label: "渠道管理", risk: "MEDIUM", description: "管理线索、询价、报价、推广码和渠道冲突。" },
  "sales:view": { label: "销售报表", risk: "MEDIUM", description: "查看销售业绩、转化和客户指标。" },
  "finance:manage": { label: "财务管理", risk: "HIGH", description: "查看应收、收款、对账、毛利和财务字段。" },
  "warehouse:manage": { label: "仓储作业", risk: "HIGH", description: "管理仓储任务、盘点和履约作业。" },
  "delivery:manage": { label: "配送管理", risk: "MEDIUM", description: "管理配送单、异常和物流状态。" },
  "marketing:manage": { label: "运营营销", risk: "MEDIUM", description: "管理优惠券、新品推送和营销活动。" },
  "wechat:manage": { label: "微信生态", risk: "HIGH", description: "配置公众号菜单、模板消息和小程序相关入口。" },
  "receipts:manage": { label: "票据税控", risk: "HIGH", description: "开具电子发票、查看票据和税控结果。" },
  "settings:manage": { label: "系统设置", risk: "HIGH", description: "管理业务参数、用户账号和角色配置。" },
  "logs:manage": { label: "操作日志", risk: "HIGH", description: "查看操作日志、AI 审计和敏感操作留痕。" },
};

function PermissionPolicyPanel() {
  const permissions = Object.entries(permissionMeta) as Array<[DashboardPermission, (typeof permissionMeta)[DashboardPermission]]>;

  return (
    <section id="permission-policy" className="surface-panel p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-700" />
            <h2 className="font-semibold text-neutral-950">权限策略</h2>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            后台权限采用固定角色矩阵，页面路由、菜单过滤、AI 工具和 server action 均按同一套角色权限校验。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/logs">查看权限审计日志</Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <PolicyNote title="管理员专属" text="系统设置、操作日志、微信生态、经销商审核和商品维护仅管理员拥有。" />
        <PolicyNote title="字段隔离" text="财务与成本字段按角色拆分，非授权角色不能通过页面或 AI 工具读取。" />
        <PolicyNote title="二次确认" text="写操作和高风险 AI 工具必须生成确认卡，不允许直接绕过权限执行。" />
      </div>

      <div className="mt-5 overflow-x-auto rounded-md border border-[var(--dashboard-line)]">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="bg-[var(--dashboard-control)] text-neutral-600">
            <tr>
              <th className="px-4 py-3 font-medium">权限</th>
              <th className="px-4 py-3 font-medium">风险</th>
              <th className="px-4 py-3 font-medium">允许角色</th>
              <th className="px-4 py-3 font-medium">说明</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--dashboard-line)]">
            {permissions.map(([permission, meta]) => (
              <tr key={permission}>
                <td className="px-4 py-3">
                  <p className="font-medium text-neutral-950">{meta.label}</p>
                  <p className="mt-1 font-mono text-xs text-neutral-500">{permission}</p>
                </td>
                <td className="px-4 py-3">
                  <RiskBadge risk={meta.risk} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {permissionRoles[permission].map((role) => (
                      <span className="rounded-full bg-orange-50 px-2 py-1 text-xs text-orange-800" key={role}>
                        {roleLabels[role]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-600">{meta.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PolicyNote({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-orange-100 bg-[#fff8f3] p-3">
      <p className="font-medium text-neutral-950">{title}</p>
      <p className="mt-1 text-sm text-neutral-600">{text}</p>
    </div>
  );
}

function RiskBadge({ risk }: { risk: "HIGH" | "MEDIUM" | "LOW" }) {
  const className =
    risk === "HIGH"
      ? "bg-red-50 text-red-700"
      : risk === "MEDIUM"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  const label = risk === "HIGH" ? "高" : risk === "MEDIUM" ? "中" : "低";
  return <span className={`rounded-full px-2 py-1 text-xs ${className}`}>{label}</span>;
}

function SystemCompletenessPanel({ report }: { report: Awaited<ReturnType<typeof getSettingsData>>["systemCompleteness"] }) {
  return (
    <section id="system-completeness" className="surface-panel p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <SystemStatusIcon severity={report.status} />
            <h2 className="font-semibold text-neutral-950">全系统完整度检查</h2>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            只检查程序自身是否完整：真实入口、真实操作、权限、审计、异常处理和自动化验证；不把域名、微信、支付、税控、资质当作程序缺陷。
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs sm:text-sm">
          <SystemSummaryPill label="就绪" tone="ready" value={report.readyCount} />
          <SystemSummaryPill label="待办" tone="todo" value={report.todoCount} />
          <SystemSummaryPill label="风险" tone="warning" value={report.warningCount} />
          <SystemSummaryPill label="阻塞" tone="blocker" value={report.blockerCount} />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-orange-100 bg-[#fff8f3] px-3 py-2 text-xs text-neutral-600">
        检查时间：{new Date(report.checkedAt).toLocaleString("zh-CN", { hour12: false })}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {report.modules.map((module) => (
          <div className="rounded-md border border-orange-100 bg-[#fff8f3] p-4" key={module.key}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-orange-700">{module.area}</p>
                <h3 className="mt-1 font-semibold text-neutral-950">{module.label}</h3>
                <p className="mt-1 text-sm text-neutral-500">{module.summary}</p>
              </div>
              <SystemStatusIcon severity={module.status} />
            </div>
            <div className="mt-3 divide-y divide-orange-100">
              {module.items.map((item) => (
                <CompletenessRow item={item} key={item.key} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SystemSummaryPill({ label, value, tone }: { label: string; value: number; tone: "ready" | "todo" | "warning" | "blocker" }) {
  const className =
    tone === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "todo"
        ? "border-orange-200 bg-orange-50 text-orange-900"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`rounded-md border px-3 py-2 ${className}`}>
      <p className="text-lg font-bold">{value}</p>
      <p>{label}</p>
    </div>
  );
}

function OperationalAcceptancePanel({ report }: { report: Awaited<ReturnType<typeof getSettingsData>>["operationalAcceptance"] }) {
  const grouped = report.items.reduce<Record<string, OperationalAcceptanceItem[]>>((current, item) => {
    current[item.area] = [...(current[item.area] ?? []), item];
    return current;
  }, {});

  return (
    <section id="operational-acceptance" className="surface-panel p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <OperationalStatusIcon severity={report.status} />
            <h2 className="font-semibold text-neutral-950">运营验收检查</h2>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            检查上线运营是否可接手：业务签收、真机验收、真实支付/税控联调、备份恢复演练；这些不是程序完整度问题。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <OperationalSummaryPill label="已签收" tone="ready" value={report.readyCount} />
          <OperationalSummaryPill label="待验收" tone="warning" value={report.warningCount} />
          <OperationalSummaryPill label="阻塞" tone="blocker" value={report.blockerCount} />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-orange-100 bg-[#fff8f3] px-3 py-2 text-xs text-neutral-600">
        检查时间：{new Date(report.checkedAt).toLocaleString("zh-CN", { hour12: false })}
      </div>

      <div className="mt-5 space-y-4">
        {Object.entries(grouped).map(([group, items]) => (
          <div className="rounded-md border border-orange-100 bg-[#fff8f3] p-4" key={group}>
            <h3 className="text-sm font-semibold text-neutral-950">{group}</h3>
            <div className="mt-3 divide-y divide-orange-100">
              {items.map((item) => (
                <OperationalRow item={item} key={item.key} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OperationalSummaryPill({ label, value, tone }: { label: string; value: number; tone: "ready" | "warning" | "blocker" }) {
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

function OperationalRow({ item }: { item: OperationalAcceptanceItem }) {
  return (
    <div className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="flex items-start gap-2">
        <OperationalStatusIcon severity={item.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-neutral-950">{item.label}</p>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-800">{operationalSeverityLabel(item.severity)}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">{item.summary}</p>
          {item.severity !== "READY" ? <p className="mt-1 text-sm text-neutral-700">处理动作：{item.action}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1">
            {item.evidence.slice(0, 4).map((entry) => (
              <code className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-900" key={entry}>
                {entry}
              </code>
            ))}
          </div>
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

function OperationalStatusIcon({ severity }: { severity: OperationalAcceptanceSeverity }) {
  if (severity === "READY") return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />;
  if (severity === "WARNING") return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />;
  return <XCircle className="h-5 w-5 shrink-0 text-red-600" />;
}

function operationalSeverityLabel(severity: OperationalAcceptanceSeverity) {
  if (severity === "READY") return "已签收";
  if (severity === "WARNING") return "待验收";
  return "验收阻塞";
}

function CompletenessRow({ item }: { item: SystemCompletenessItem }) {
  return (
    <div className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="flex items-start gap-2">
        <SystemStatusIcon severity={item.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-neutral-950">{item.label}</p>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-800">{systemSeverityLabel(item.severity)}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">{item.summary}</p>
          {item.severity !== "READY" ? <p className="mt-1 text-sm text-neutral-700">处理动作：{item.action}</p> : null}
          {item.evidence.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.evidence.slice(0, 4).map((entry) => (
                <code className="rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-900" key={entry}>
                  {entry}
                </code>
              ))}
              {item.evidence.length > 4 ? <span className="text-xs text-neutral-400">+{item.evidence.length - 4}</span> : null}
            </div>
          ) : null}
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

function SystemStatusIcon({ severity }: { severity: SystemCompletenessSeverity }) {
  if (severity === "READY") return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />;
  if (severity === "TODO") return <Settings className="h-5 w-5 shrink-0 text-orange-600" />;
  if (severity === "WARNING") return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />;
  return <XCircle className="h-5 w-5 shrink-0 text-red-600" />;
}

function systemSeverityLabel(severity: SystemCompletenessSeverity) {
  if (severity === "READY") return "已就绪";
  if (severity === "TODO") return "待完善";
  if (severity === "WARNING") return "上线风险";
  return "上线阻塞";
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
