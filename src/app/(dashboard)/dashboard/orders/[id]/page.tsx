import Link from "next/link";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { roleHasPermission } from "@/features/auth/permissions";
import { OrderStatusActions } from "@/features/orders/OrderStatusActions";
import { getOrderDetail } from "@/features/orders/queries";
import {
  formatCurrency,
  formatDateTime,
  orderStatusClasses,
  orderStatusLabels,
  orderTypeLabels,
  payMethodLabels,
  routingStatusLabels,
  routingTypeLabels,
} from "@/features/orders/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type OrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const session = await auth();
  const canWriteOrders = roleHasPermission(session?.user.role, "orders:write");
  const canFulfillOrders = roleHasPermission(session?.user.role, "orders:fulfill");
  const canOperateOrders = canWriteOrders || canFulfillOrders;
  const allowedOrderActions: Array<"confirm" | "ship" | "complete" | "cancel"> = [
    ...(canWriteOrders ? (["confirm", "cancel"] as const) : []),
    ...(canFulfillOrders ? (["ship", "complete"] as const) : []),
  ];
  const { id } = await params;
  const order = await getOrderDetail(id);
  const itemsTotal = order.items.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">订单详情</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{order.orderNo}</h1>
          <p className="mt-1 text-sm text-slate-500">{formatDateTime(order.createdAt)} 创建</p>
        </div>
        {canOperateOrders ? <OrderStatusActions allowedActions={allowedOrderActions} orderId={order.id} status={order.status} /> : null}
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">订单状态</p>
          <span className={cn("mt-3 inline-flex rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[order.status])}>
            {orderStatusLabels[order.status]}
          </span>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">客户</p>
          <p className="mt-2 font-semibold text-slate-900">{order.customer.name}</p>
          <p className="text-sm text-slate-500">{order.customer.phone}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">类型 / 分单</p>
          <p className="mt-2 font-semibold text-slate-900">{orderTypeLabels[order.type]} · {routingTypeLabels[order.routingType]}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">应收金额</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(order.payableAmount)}</p>
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">商品明细</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">商品</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">单价</th>
                <th className="px-3 py-2 font-medium">数量</th>
                <th className="px-3 py-2 text-right font-medium">小计</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr className="border-t border-slate-100" key={item.id}>
                  <td className="px-3 py-3 font-medium text-slate-900">{item.productName}</td>
                  <td className="px-3 py-3 text-slate-500">{item.sku}</td>
                  <td className="px-3 py-3 text-slate-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-3 text-slate-600">{item.quantity}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-900">{formatCurrency(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-right text-sm text-slate-500">
          明细合计：<span className="font-semibold text-slate-900">{formatCurrency(itemsTotal)}</span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">收货地址</h2>
          <p className="mt-3 font-medium text-slate-900">{order.address.name} {order.address.phone}</p>
          <p className="mt-1 text-sm text-slate-600">{order.address.province}{order.address.city}{order.address.district}{order.address.detail}</p>
          {order.remark ? <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">备注：{order.remark}</p> : null}
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">支付记录</h2>
          <div className="mt-3 space-y-3">
            {order.payments.map((payment) => (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm" key={payment.id}>
                <span>{payMethodLabels[payment.method]} · {payment.status}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(payment.amount)}</span>
              </div>
            ))}
            {order.payments.length === 0 ? <p className="text-sm text-slate-500">暂无支付记录</p> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">分单记录</h2>
          <div className="mt-3 space-y-3">
            {order.routings.map((routing) => (
              <div className="rounded-md border border-slate-200 p-3 text-sm" key={routing.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900">{routing.dealerName}</span>
                  <span className="text-slate-500">{routing.distance.toFixed(2)} km</span>
                </div>
                <p className="mt-1 text-slate-500">{routingStatusLabels[routing.status]} · {formatDateTime(routing.assignedAt)}</p>
                {routing.reason ? <p className="mt-1 text-red-600">原因：{routing.reason}</p> : null}
              </div>
            ))}
            {order.routings.length === 0 ? <p className="text-sm text-slate-500">当前订单由总仓处理，暂无经销商分单记录。</p> : null}
          </div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">物流时间线</h2>
          <div className="mt-3 space-y-3">
            {order.timeline.map((item) => (
              <div className="flex gap-3 text-sm" key={`${item.label}-${item.at}`}>
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                <div>
                  <p className="font-medium text-slate-900">{item.label}</p>
                  <p className="text-slate-500">{formatDateTime(item.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Button asChild variant="outline">
        <Link href="/dashboard/orders">返回列表</Link>
      </Button>
    </div>
  );
}
