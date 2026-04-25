function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readPrivateKey(value?: string) {
  return value?.replace(/\\n/g, "\n");
}

export function getWechatConfig() {
  const appUrl = readEnv("NEXT_PUBLIC_APP_URL") ?? readEnv("NEXTAUTH_URL") ?? "http://localhost:3000";

  return {
    appUrl,
    miniAppId: readEnv("WECHAT_MINI_APP_ID"),
    miniAppSecret: readEnv("WECHAT_MINI_APP_SECRET"),
    officialAppId: readEnv("WECHAT_OFFICIAL_APP_ID"),
    officialAppSecret: readEnv("WECHAT_OFFICIAL_APP_SECRET"),
    officialOrderTemplateId: readEnv("WECHAT_OFFICIAL_ORDER_TEMPLATE_ID"),
    payMchId: readEnv("WECHAT_PAY_MCH_ID"),
    paySerialNo: readEnv("WECHAT_PAY_SERIAL_NO"),
    payPrivateKey: readPrivateKey(readEnv("WECHAT_PAY_PRIVATE_KEY")),
    payApiV3Key: readEnv("WECHAT_PAY_APIV3_KEY") ?? readEnv("WECHAT_PAY_API_KEY"),
    payPlatformCertificate: readPrivateKey(readEnv("WECHAT_PAY_PLATFORM_CERT")),
    payNotifyUrl: readEnv("WECHAT_PAY_NOTIFY_URL") ?? `${appUrl.replace(/\/$/, "")}/api/wechat/pay/notify`,
  };
}

export function getWechatFeatureStatus() {
  const config = getWechatConfig();

  return {
    miniLoginConfigured: Boolean(config.miniAppId && config.miniAppSecret),
    wechatPayConfigured: Boolean(config.miniAppId && config.payMchId && config.paySerialNo && config.payPrivateKey && config.payApiV3Key),
    officialAccountConfigured: Boolean(config.officialAppId && config.officialAppSecret),
    officialTemplateConfigured: Boolean(config.officialOrderTemplateId),
    notifyUrl: config.payNotifyUrl,
    appUrl: config.appUrl,
  };
}
