import { getWechatFeatureStatus } from "@/features/wechat/config";
import { prisma } from "@/lib/prisma";

export async function getWechatDashboardData() {
  const [miniUsers, officialUsers, messageLogs, shareEvents, miniOrders, pendingMiniOrders] = await Promise.all([
    prisma.customer.count({ where: { wechatMiniOpenId: { not: null } } }),
    prisma.customer.count({ where: { wechatOfficialOpenId: { not: null } } }),
    prisma.wechatMessageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        customer: { select: { name: true, phone: true } },
        order: { select: { orderNo: true } },
      },
    }),
    prisma.wechatShareEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        customer: { select: { name: true, phone: true } },
      },
    }),
    prisma.order.count({ where: { source: "MINI_PROGRAM" } }),
    prisma.order.count({ where: { source: "MINI_PROGRAM", status: "PENDING_PAYMENT" } }),
  ]);

  const shareCount = await prisma.wechatShareEvent.count();

  return {
    status: getWechatFeatureStatus(),
    stats: {
      miniUsers,
      officialUsers,
      miniOrders,
      pendingMiniOrders,
      shareCount,
    },
    messageLogs: messageLogs.map((log) => ({
      id: log.id,
      scene: log.scene,
      status: log.status,
      customerName: log.customer?.name ?? "未绑定客户",
      orderNo: log.order?.orderNo ?? null,
      error: log.error,
      createdAt: log.createdAt.toISOString(),
      sentAt: log.sentAt?.toISOString() ?? null,
    })),
    shareEvents: shareEvents.map((event) => ({
      id: event.id,
      scene: event.scene,
      title: event.title,
      path: event.path,
      target: event.target,
      customerName: event.customer?.name ?? "匿名访客",
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
