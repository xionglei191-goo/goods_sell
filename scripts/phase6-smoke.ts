import { getDeliveryData } from "@/features/delivery/queries";
import { getAuditLogData } from "@/features/logs/queries";
import { getReceiptsData } from "@/features/receipts/queries";
import { getSettingsData, getUserManagementData } from "@/features/settings/queries";
import { getWarehouseData } from "@/features/warehouse/queries";
import { prisma } from "@/lib/prisma";

const baseUrl = process.env.PHASE6_BASE_URL ?? "http://localhost:3000";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const warehouse = await getWarehouseData();
  assert(warehouse.summary.totalSku >= 33, "仓储总 SKU 应至少为 33");
  assert(Array.isArray(warehouse.warningProducts), "仓储预警列表应可读取");

  const delivery = await getDeliveryData({});
  assert(typeof delivery.summary.completionRate === "number", "配送完成率应为数字");

  const receipts = await getReceiptsData({});
  assert(Array.isArray(receipts.payments), "票据收付款列表应可读取");
  assert(Array.isArray(receipts.invoiceableOrders), "待开票订单列表应可读取");

  const settings = await getSettingsData();
  assert(settings.businessConfigs.length === 4, "业务参数应包含 4 项");
  const users = await getUserManagementData();
  assert(users.users.length >= 4, "后台用户应至少包含 seed 的 4 个账号");

  const logs = await getAuditLogData({});
  assert(Array.isArray(logs.logs), "操作日志列表应可读取");

  const [systemConfigCount, auditCount, invoiceCount] = await Promise.all([
    prisma.systemConfig.count(),
    prisma.auditLog.count(),
    prisma.invoice.count(),
  ]);
  assert(systemConfigCount >= 4, "SystemConfig 应已初始化");
  assert(auditCount >= 0, "AuditLog 表应可查询");
  assert(invoiceCount >= 0, "Invoice 表应可查询");

  const response = await fetch(`${baseUrl}/dashboard/settings`, { redirect: "manual" });
  assert(response.status === 307 || response.status === 302, "未登录访问系统设置应被重定向");

  console.log("Phase 6 smoke passed", {
    totalSku: warehouse.summary.totalSku,
    deliveryRows: delivery.items.length,
    payments: receipts.payments.length,
    users: users.users.length,
    logs: logs.total,
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
