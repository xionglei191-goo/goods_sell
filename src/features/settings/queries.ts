import { getWechatFeatureStatus } from "@/features/wechat/config";
import { getLaunchReadinessReport } from "@/features/system/launch-readiness";
import { prisma } from "@/lib/prisma";

export const businessConfigDefaults = [
  { key: "defaultSafeStock", label: "默认安全库存", description: "新商品默认安全库存阈值", value: 30 },
  { key: "bulkOrderAmount", label: "大小单金额界线", description: "超过该金额优先总仓处理", value: 500 },
  { key: "deliveryRadius", label: "配送范围（米）", description: "经销商默认服务半径", value: 3000 },
  { key: "creditDays", label: "赊账账期（天）", description: "赊账订单默认到期天数", value: 30 },
] as const;

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function getSettingsData() {
  const existing = await prisma.systemConfig.findMany({ where: { group: "business" } });
  const existingMap = new Map(existing.map((item) => [item.key, item]));
  const missing = businessConfigDefaults.filter((item) => !existingMap.has(item.key));

  if (missing.length > 0) {
    await prisma.$transaction(
      missing.map((item) =>
        prisma.systemConfig.create({
          data: {
            key: item.key,
            label: item.label,
            description: item.description,
            value: item.value,
            group: "business",
          },
        }),
      ),
    );
  }

  const configs = await prisma.systemConfig.findMany({ where: { group: "business" }, orderBy: { key: "asc" } });
  const configMap = new Map(configs.map((item) => [item.key, item]));

  return {
    businessConfigs: businessConfigDefaults.map((item) => {
      const config = configMap.get(item.key);
      return {
        key: item.key,
        label: item.label,
        description: item.description,
        value: numberValue(config?.value, item.value),
        updatedAt: config?.updatedAt.toISOString() ?? null,
      };
    }),
    integrations: {
      wechat: getWechatFeatureStatus(),
      ai: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL),
      amap: Boolean(process.env.AMAP_KEY),
      tax: Boolean(process.env.TAX_PROVIDER && process.env.TAX_PROVIDER !== "MOCK"),
    },
    launchReadiness: getLaunchReadinessReport(),
  };
}

export async function getUserManagementData() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })),
  };
}
