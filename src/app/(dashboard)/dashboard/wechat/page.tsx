import { CheckCircle2, MessageSquareText, Send, Share2, Smartphone, WalletCards } from "lucide-react";

import { OfficialMenuButton } from "@/features/wechat/OfficialMenuButton";
import { getWechatDashboardData } from "@/features/wechat/queries";
import { formatDateTime } from "@/features/shop/utils";

const statusLabels = {
  miniLoginConfigured: "小程序登录",
  wechatPayConfigured: "微信支付",
  officialAccountConfigured: "公众号",
  officialTemplateConfigured: "模板消息",
} as const;

export default async function WechatDashboardPage() {
  const data = await getWechatDashboardData();
  const statusEntries = Object.entries(statusLabels).map(([key, label]) => ({
    label,
    enabled: data.status[key as keyof typeof statusLabels],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold text-stone-950">微信生态</h1>
          <p className="mt-1 text-sm text-stone-500">小程序登录、JSAPI 支付、公众号菜单、模板消息和分享裂变监控。</p>
        </div>
        <OfficialMenuButton />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "小程序用户", value: data.stats.miniUsers, icon: Smartphone },
          { label: "公众号绑定", value: data.stats.officialUsers, icon: MessageSquareText },
          { label: "小程序订单", value: data.stats.miniOrders, icon: WalletCards },
          { label: "待支付订单", value: data.stats.pendingMiniOrders, icon: Send },
          { label: "分享事件", value: data.stats.shareCount, icon: Share2 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200" key={item.label}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-500">{item.label}</span>
                <Icon className="h-5 w-5 text-[#dc2626]" />
              </div>
              <p className="mt-3 text-2xl font-bold text-stone-950">{item.value}</p>
            </section>
          );
        })}
      </div>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h2 className="font-bold text-stone-950">配置状态</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {statusEntries.map((item) => (
            <div className={item.enabled ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3" : "rounded-lg border border-amber-200 bg-amber-50 p-3"} key={item.label}>
              <p className={item.enabled ? "text-sm font-semibold text-emerald-800" : "text-sm font-semibold text-amber-800"}>{item.label}</p>
              <p className="mt-1 text-xs text-stone-600">{item.enabled ? "已配置，可真实联调" : "未配置，当前走模拟/日志模式"}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-stone-500">支付回调地址：{data.status.notifyUrl}</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-bold text-stone-950">模板消息日志</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2">场景</th>
                  <th className="px-3 py-2">客户</th>
                  <th className="px-3 py-2">订单</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.messageLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-3 font-medium text-stone-900">{log.scene}</td>
                    <td className="px-3 py-3 text-stone-600">{log.customerName}</td>
                    <td className="px-3 py-3 font-mono text-xs text-stone-500">{log.orderNo ?? "-"}</td>
                    <td className="px-3 py-3 text-stone-600">{log.status}</td>
                    <td className="px-3 py-3 text-stone-500">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.messageLogs.length === 0 ? <p className="mt-6 text-center text-sm text-stone-500">暂无消息日志</p> : null}
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-bold text-stone-950">分享裂变记录</h2>
          <div className="mt-4 space-y-3">
            {data.shareEvents.map((event) => (
              <div className="rounded-lg border border-stone-200 p-3" key={event.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-stone-900">{event.title}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {event.customerName} · {event.scene}
                    </p>
                  </div>
                  <span className="text-xs text-stone-400">{formatDateTime(event.createdAt)}</span>
                </div>
                <p className="mt-2 break-all rounded-md bg-stone-50 px-2 py-1 font-mono text-xs text-stone-500">{event.path}</p>
              </div>
            ))}
          </div>
          {data.shareEvents.length === 0 ? <p className="mt-6 text-center text-sm text-stone-500">暂无分享记录</p> : null}
        </section>
      </div>
    </div>
  );
}
