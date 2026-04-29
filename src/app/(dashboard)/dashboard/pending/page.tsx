import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, PackageSearch, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime, orderStatusClasses, orderStatusLabels } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

type PendingOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  status: "PAID" | "CONFIRMED";
  amount: number;
  createdAt: string;
};

type LowStockProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  safeStock: number;
};

type OverduePayment = {
  id: string;
  customerName: string;
  amount: number;
  dueDate: string;
  orderId: string | null;
  orderNo: string | null;
};

async function getPendingData() {
  const now = new Date();

  const [orders, products, payments] = await Promise.all([
    prisma.order.findMany({
      where: { parentId: null, status: { in: ["PAID", "CONFIRMED"] } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.product.findMany({
      orderBy: { stock: "asc" },
      select: { id: true, name: true, sku: true, stock: true, safeStock: true },
      take: 100,
    }),
    prisma.payment.findMany({
      where: { status: "PENDING", dueDate: { lt: now } },
      include: {
        customer: { select: { name: true } },
        order: { select: { id: true, orderNo: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
  ]);

  const pendingOrders: PendingOrder[] = orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    customerName: order.customer.name,
    status: order.status as PendingOrder["status"],
    amount: Number(order.payableAmount),
    createdAt: order.createdAt.toISOString(),
  }));
  const lowStock = products.filter((product) => product.stock < product.safeStock).slice(0, 50);
  const overduePayments: OverduePayment[] = payments.map((payment) => ({
    id: payment.id,
    customerName: payment.customer.name,
    amount: Number(payment.amount),
    dueDate: (payment.dueDate ?? payment.createdAt).toISOString(),
    orderId: payment.order?.id ?? null,
    orderNo: payment.order?.orderNo ?? null,
  }));

  return {
    pendingOrders,
    lowStock,
    overduePayments,
    total: pendingOrders.length + lowStock.length + overduePayments.length,
  };
}

export default async function PendingPage() {
  const data = await getPendingData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">待处理事项</h1>
          <p className="mt-1 text-sm text-slate-500">集中处理待确认订单、库存预警和逾期应收。</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">返回仪表盘</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={ShoppingCart} label="待确认订单" value={data.pendingOrders.length.toString()} tone="blue" href="/dashboard/orders?status=PAID" />
        <SummaryCard icon={PackageSearch} label="库存预警" value={data.lowStock.length.toString()} tone="amber" href="/dashboard/inventory" />
        <SummaryCard icon={Banknote} label="逾期应收" value={data.overduePayments.length.toString()} tone="red" href="/dashboard/finance/receivable" />
      </section>

      <PendingOrdersTable orders={data.pendingOrders} />
      <LowStockTable products={data.lowStock} />
      <OverduePaymentsTable payments={data.overduePayments} />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "blue" | "amber" | "red";
  href: string;
}) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <Link className="block rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md" href={href}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Link>
  );
}

function SectionHeader({ icon: Icon, title, actionHref, actionLabel }: { icon: LucideIcon; title: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <Button asChild size="sm" variant="ghost">
        <Link href={actionHref}>
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={colSpan}>
        当前没有需要处理的记录
      </td>
    </tr>
  );
}

function PendingOrdersTable({ orders }: { orders: PendingOrder[] }) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <SectionHeader actionHref="/dashboard/orders?status=PAID" actionLabel="查看订单" icon={ShoppingCart} title="待确认订单" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">订单号</th>
              <th className="px-4 py-3 font-medium">客户</th>
              <th className="px-4 py-3 font-medium">金额</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? <EmptyRow colSpan={5} /> : null}
            {orders.map((order) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50" key={order.id}>
                <td className="px-4 py-3">
                  <Link className="font-medium text-slate-900 hover:text-blue-700" href={`/dashboard/orders/${order.id}`}>
                    {order.orderNo}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{order.customerName}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(order.amount)}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-1 text-xs font-medium", orderStatusClasses[order.status])}>
                    {orderStatusLabels[order.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LowStockTable({ products }: { products: LowStockProduct[] }) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <SectionHeader actionHref="/dashboard/inventory" actionLabel="查看库存" icon={AlertTriangle} title="库存预警" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">商品</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">当前库存</th>
              <th className="px-4 py-3 font-medium">安全库存</th>
              <th className="px-4 py-3 font-medium">缺口</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? <EmptyRow colSpan={5} /> : null}
            {products.map((product) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50" key={product.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                <td className="px-4 py-3 text-slate-600">{product.sku}</td>
                <td className="px-4 py-3 font-semibold text-red-700">{product.stock}</td>
                <td className="px-4 py-3 text-slate-600">{product.safeStock}</td>
                <td className="px-4 py-3 text-slate-600">{product.safeStock - product.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OverduePaymentsTable({ payments }: { payments: OverduePayment[] }) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <SectionHeader actionHref="/dashboard/finance/receivable" actionLabel="查看应收" icon={Banknote} title="逾期应收" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">客户</th>
              <th className="px-4 py-3 font-medium">关联订单</th>
              <th className="px-4 py-3 font-medium">应收金额</th>
              <th className="px-4 py-3 font-medium">到期日</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? <EmptyRow colSpan={5} /> : null}
            {payments.map((payment) => (
              <tr className="border-t border-slate-100 hover:bg-slate-50" key={payment.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{payment.customerName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {payment.orderId && payment.orderNo ? (
                    <Link className="hover:text-blue-700" href={`/dashboard/orders/${payment.orderId}`}>
                      {payment.orderNo}
                    </Link>
                  ) : (
                    "未关联订单"
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-red-700">{formatCurrency(payment.amount)}</td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(payment.dueDate)}</td>
                <td className="px-4 py-3 text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/finance/payments">登记收款</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
