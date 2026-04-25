import { prisma } from "@/lib/prisma";
import { formatDate } from "@/features/orders/utils";

export const dynamic = "force-dynamic";

export default async function DealersPage() {
  const dealers = await prisma.dealer.findMany({
    include: {
      customer: { select: { name: true, phone: true } },
      routings: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: dealers.length,
    accepting: dealers.filter((d) => d.isAccepting).length,
    inactive: dealers.filter((d) => !d.isAccepting).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">经销商管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          查看经销商信息、接单状态与服务区域
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">经销商总数</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">可接单</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{stats.accepting}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">暂停接单</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats.inactive}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">店铺名称</th>
                <th className="px-4 py-3 font-medium">联系人</th>
                <th className="px-4 py-3 font-medium">电话</th>
                <th className="px-4 py-3 font-medium">区域</th>
                <th className="px-4 py-3 font-medium">服务半径</th>
                <th className="px-4 py-3 font-medium">接单状态</th>
                <th className="px-4 py-3 font-medium">已接订单</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((dealer) => {
                const acceptedCount = dealer.routings.filter(
                  (r) => r.status === "ACCEPTED"
                ).length;
                return (
                  <tr
                    className="border-t border-slate-100 hover:bg-slate-50"
                    key={dealer.id}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {dealer.shopName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {dealer.customer.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {dealer.customer.phone}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{dealer.zone}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {dealer.serviceRadius}m
                    </td>
                    <td className="px-4 py-3">
                      {dealer.isAccepting ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-600/20">
                          接单中
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
                          暂停
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{acceptedCount}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(dealer.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {dealers.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>
                    暂无经销商数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
