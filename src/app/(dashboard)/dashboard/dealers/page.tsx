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
        <h1 className="text-2xl font-semibold text-neutral-950">经销商管理</h1>
        <p className="mt-1 text-sm text-neutral-500">
          查看经销商信息、接单状态与服务区域
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">经销商总数</p>
          <p className="mt-1 text-2xl font-bold text-neutral-950">{stats.total}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">可接单</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{stats.accepting}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-neutral-500">暂停接单</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats.inactive}</p>
        </div>
      </div>

      {/* Table */}
      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="dashboard-table-head">
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
                    className="dashboard-table-row"
                    key={dealer.id}
                  >
                    <td className="px-4 py-3 font-medium text-neutral-950">
                      {dealer.shopName}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {dealer.customer.name}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {dealer.customer.phone}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{dealer.zone}</td>
                    <td className="px-4 py-3 text-neutral-600">
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
                    <td className="px-4 py-3 text-neutral-600">{acceptedCount}</td>
                    <td className="px-4 py-3 text-neutral-500">
                      {formatDate(dealer.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {dealers.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-400" colSpan={8}>
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
