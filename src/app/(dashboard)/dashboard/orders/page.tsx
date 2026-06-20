import Link from "next/link";
import { Plus } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { roleHasPermission } from "@/features/auth/permissions";
import { ExportOrdersButton } from "@/features/orders/ExportOrdersButton";
import { OrderFilters } from "@/features/orders/OrderFilters";
import { OrderStatusActions } from "@/features/orders/OrderStatusActions";
import { getOrderList } from "@/features/orders/queries";
import {
  formatCurrency,
  formatDateTime,
  getPaymentClass,
  orderStatusClasses,
  orderStatusLabels,
  orderTypeLabels,
  routingTypeLabels,
} from "@/features/orders/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type OrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await auth();
  const canWriteOrders = roleHasPermission(session?.user.role, "orders:write");
  const canFulfillOrders = roleHasPermission(session?.user.role, "orders:fulfill");
  const canOperateOrders = canWriteOrders || canFulfillOrders;
  const allowedOrderActions: Array<"confirm" | "ship" | "complete" | "cancel"> = [
    ...(canWriteOrders ? (["confirm", "cancel"] as const) : []),
    ...(canFulfillOrders ? (["ship", "complete"] as const) : []),
  ];
  const params = await searchParams;
  const data = await getOrderList(params);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-950">订单管理</h1>
          <p className="mt-1 text-sm text-neutral-500">统一处理商城订单、线下开单和履约状态</p>
        </div>
        <div className="flex gap-2">
          <ExportOrdersButton orders={data.items} />
          {canWriteOrders ? (
            <Button asChild>
              <Link href="/dashboard/orders/new">
                <Plus className="h-4 w-4" />
                手动开单
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <OrderFilters initial={data.filters} />

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="dashboard-table-head">
              <tr>
                <th className="px-4 py-3 font-medium">订单号</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">支付</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">分单</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr className="dashboard-table-row" key={order.id}>
                  <td className="px-4 py-3">
                    <Link className="font-medium text-neutral-950 hover:text-orange-700" href={`/dashboard/orders/${order.id}`}>
                      {order.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-950">{order.customerName}</p>
                    <p className="mt-1 text-xs text-neutral-500">{order.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{orderTypeLabels[order.type]}</td>
                  <td className="px-4 py-3 money-muted">{formatCurrency(order.payableAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", getPaymentClass(order.payableAmount, order.paidAmount))}>
                      {order.paymentLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[order.status])}>
                      {orderStatusLabels[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{routingTypeLabels[order.routingType]}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {canOperateOrders ? <OrderStatusActions allowedActions={allowedOrderActions} orderId={order.id} status={order.status} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-3 text-sm text-neutral-500" style={{ borderColor: "var(--dashboard-line)" }}>共 {data.total} 张订单</div>
      </div>
    </div>
  );
}
