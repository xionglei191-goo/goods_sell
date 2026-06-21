export type LaunchReadinessSeverity = "BLOCKER" | "WARNING" | "READY";
export type LaunchReadinessMode = "production" | "trial" | "demo";

export type LaunchReadinessItem = {
  key: string;
  label: string;
  group: string;
  severity: LaunchReadinessSeverity;
  configured: boolean;
  variables: string[];
  summary: string;
  action: string;
  href?: string;
};

export type LaunchReadinessReport = {
  mode: LaunchReadinessMode;
  checkedAt: string;
  status: LaunchReadinessSeverity;
  readyCount: number;
  warningCount: number;
  blockerCount: number;
  items: LaunchReadinessItem[];
};

type EnvMap = Record<string, string | undefined>;

const placeholderPatterns = [/^your-/i, /^changeme$/i, /^change-me$/i, /^\.\.\.$/, /placeholder/i];

function valueOf(env: EnvMap, name: string) {
  return env[name]?.trim();
}

function isConfigured(env: EnvMap, name: string) {
  const value = valueOf(env, name);
  if (!value) return false;
  return !placeholderPatterns.some((pattern) => pattern.test(value));
}

function anyConfigured(env: EnvMap, names: string[]) {
  return names.some((name) => isConfigured(env, name));
}

function allConfigured(env: EnvMap, names: string[]) {
  return names.every((name) => isConfigured(env, name));
}

function item(params: {
  key: string;
  label: string;
  group: string;
  required?: boolean;
  configured: boolean;
  variables: string[];
  readySummary: string;
  missingSummary: string;
  action: string;
  href?: string;
}): LaunchReadinessItem {
  return {
    key: params.key,
    label: params.label,
    group: params.group,
    severity: params.configured ? "READY" : params.required ? "BLOCKER" : "WARNING",
    configured: params.configured,
    variables: params.variables,
    summary: params.configured ? params.readySummary : params.missingSummary,
    action: params.configured ? "无需处理" : params.action,
    href: params.href,
  };
}

export function normalizeLaunchReadinessMode(value?: string | null): LaunchReadinessMode {
  if (value === "trial" || value === "demo" || value === "production") return value;
  return "production";
}

export function getLaunchReadinessReport(env: EnvMap = process.env, options: { mode?: LaunchReadinessMode } = {}): LaunchReadinessReport {
  const mode = options.mode ?? normalizeLaunchReadinessMode(env.LAUNCH_READINESS_MODE);
  const production = mode === "production";
  const items: LaunchReadinessItem[] = [
    item({
      key: "database",
      label: "PostgreSQL 数据库",
      group: "基础环境",
      required: true,
      configured: isConfigured(env, "DATABASE_URL"),
      variables: ["DATABASE_URL"],
      readySummary: "数据库连接串已配置。",
      missingSummary: "缺少数据库连接串，生产环境无法读写业务数据。",
      action: "配置 DATABASE_URL，并完成 Prisma migrate/seed 或生产数据迁移。",
    }),
    item({
      key: "auth",
      label: "登录会话密钥",
      group: "基础环境",
      required: true,
      configured: anyConfigured(env, ["AUTH_SECRET", "NEXTAUTH_SECRET"]),
      variables: ["AUTH_SECRET", "NEXTAUTH_SECRET"],
      readySummary: "Auth.js 会话密钥已配置。",
      missingSummary: "缺少 Auth.js 会话密钥，登录与中间件会报错。",
      action: "配置 AUTH_SECRET 或 NEXTAUTH_SECRET，生产环境使用高强度随机值。",
    }),
    item({
      key: "app_url",
      label: "公网应用地址",
      group: "基础环境",
      required: true,
      configured: anyConfigured(env, ["NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL"]),
      variables: ["NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL"],
      readySummary: "应用公网地址已配置。",
      missingSummary: "缺少应用公网地址，微信回调、支付通知和登录回跳可能异常。",
      action: "配置 NEXT_PUBLIC_APP_URL 和 NEXTAUTH_URL 为正式域名。",
    }),
    item({
      key: "ai",
      label: "AI 模型接口",
      group: "AI 助手",
      configured: allConfigured(env, ["AI_BASE_URL", "AI_API_KEY"]) || allConfigured(env, ["DASHSCOPE_BASE_URL", "DASHSCOPE_API_KEY"]) || isConfigured(env, "DEEPSEEK_API_KEY"),
      variables: ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "DASHSCOPE_BASE_URL", "DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY"],
      readySummary: "AI provider 已配置，助手可使用模型规划增强。",
      missingSummary: "AI provider 未完整配置，助手仍可使用内置规则，但复杂口语理解会下降。",
      action: "配置 Anthropic-compatible AI_BASE_URL、AI_API_KEY 和 AI_MODEL。",
      href: "/dashboard/settings",
    }),
    item({
      key: "amap",
      label: "高德地图",
      group: "地图配送",
      configured: anyConfigured(env, ["NEXT_PUBLIC_AMAP_KEY", "AMAP_KEY"]) && anyConfigured(env, ["NEXT_PUBLIC_AMAP_SECURITY_CODE", "AMAP_SECRET", "AMAP_SECURITY_CODE"]),
      variables: ["NEXT_PUBLIC_AMAP_KEY", "AMAP_KEY", "NEXT_PUBLIC_AMAP_SECURITY_CODE", "AMAP_SECRET", "AMAP_SECURITY_CODE"],
      readySummary: "高德地图 Key 与安全密钥已配置。",
      missingSummary: "地图 Key 或安全密钥未完整配置，后台地图会降级为本地坐标示意图。",
      action: "配置高德 Web JS API Key、安全密钥和域名白名单。",
      href: "/dashboard/map",
    }),
    item({
      key: "wechat_mini",
      label: "微信小程序",
      group: "微信生态",
      required: production,
      configured: allConfigured(env, ["WECHAT_MINI_APP_ID", "WECHAT_MINI_APP_SECRET"]),
      variables: ["WECHAT_MINI_APP_ID", "WECHAT_MINI_APP_SECRET"],
      readySummary: "微信小程序 AppID/Secret 已配置。",
      missingSummary: "小程序 AppID/Secret 未配置，小程序登录会使用 mock 联调模式。",
      action: "配置微信小程序 AppID 和 Secret，并完成小程序审核。",
      href: "/dashboard/wechat",
    }),
    item({
      key: "wechat_official",
      label: "微信公众号",
      group: "微信生态",
      required: production,
      configured: allConfigured(env, ["WECHAT_OFFICIAL_APP_ID", "WECHAT_OFFICIAL_APP_SECRET", "WECHAT_OFFICIAL_ORDER_TEMPLATE_ID"]),
      variables: ["WECHAT_OFFICIAL_APP_ID", "WECHAT_OFFICIAL_APP_SECRET", "WECHAT_OFFICIAL_ORDER_TEMPLATE_ID"],
      readySummary: "公众号和订单模板消息已配置。",
      missingSummary: "公众号或模板 ID 未配置，模板消息会写入 MOCKED/SKIPPED 日志。",
      action: "配置公众号 AppID/Secret 和订单状态模板 ID。",
      href: "/dashboard/wechat",
    }),
    item({
      key: "wechat_pay",
      label: "微信支付",
      group: "支付",
      required: production,
      configured: allConfigured(env, ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_APIV3_KEY", "WECHAT_PAY_NOTIFY_URL"]),
      variables: ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_APIV3_KEY", "WECHAT_PAY_NOTIFY_URL"],
      readySummary: "微信支付商户号、证书和回调地址已配置。",
      missingSummary: "微信支付未完整配置，系统会返回 mocked 预支付参数。",
      action: "配置微信支付商户号、证书序列号、私钥、APIv3 Key 和支付通知 URL。",
      href: "/dashboard/wechat",
    }),
    item({
      key: "tax",
      label: "税控电子发票",
      group: "票税",
      required: production,
      configured: isConfigured(env, "TAX_PROVIDER") && valueOf(env, "TAX_PROVIDER") !== "MOCK" && anyConfigured(env, ["TAX_API_BASE_URL", "TAX_API_KEY"]),
      variables: ["TAX_PROVIDER", "TAX_API_BASE_URL", "TAX_API_KEY"],
      readySummary: "税控服务商和接口凭据已配置。",
      missingSummary: "税控接口未配置，开票仍处于 Mock 模式。",
      action: "配置 TAX_PROVIDER、TAX_API_BASE_URL 和 TAX_API_KEY，并完成税控平台联调。",
      href: "/dashboard/receipts",
    }),
    item({
      key: "alcohol_license",
      label: "酒类经营资质",
      group: "合规资质",
      required: production,
      configured: anyConfigured(env, ["ALCOHOL_BUSINESS_LICENSE_NO", "ALCOHOL_LICENSE_NO"]),
      variables: ["ALCOHOL_BUSINESS_LICENSE_NO", "ALCOHOL_LICENSE_NO"],
      readySummary: "酒类经营资质编号已登记。",
      missingSummary: "缺少酒类经营资质编号，酒类线上销售上线存在合规阻塞。",
      action: "办理/确认酒类经营许可，并配置 ALCOHOL_BUSINESS_LICENSE_NO。",
    }),
  ];

  const blockerCount = items.filter((entry) => entry.severity === "BLOCKER").length;
  const warningCount = items.filter((entry) => entry.severity === "WARNING").length;
  const readyCount = items.filter((entry) => entry.severity === "READY").length;
  return {
    mode,
    checkedAt: new Date().toISOString(),
    status: blockerCount > 0 ? "BLOCKER" : warningCount > 0 ? "WARNING" : "READY",
    readyCount,
    warningCount,
    blockerCount,
    items,
  };
}
