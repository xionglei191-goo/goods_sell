import type { Prisma } from "@prisma/client";

import { getWechatConfig } from "@/features/wechat/config";
import { formatCurrency, orderStatusLabels } from "@/features/shop/utils";
import { prisma } from "@/lib/prisma";

type CachedAccessToken = {
  accessToken?: string;
  mock?: boolean;
};

type AccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

function cacheValue(value: unknown): CachedAccessToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = value as Record<string, unknown>;
  return {
    accessToken: typeof next.accessToken === "string" ? next.accessToken : undefined,
    mock: typeof next.mock === "boolean" ? next.mock : undefined,
  };
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function getOfficialAccessToken() {
  const config = getWechatConfig();
  const cacheKey = "wechat:official:access_token";
  const now = new Date();
  const cached = await prisma.integrationCache.findUnique({ where: { key: cacheKey } });
  if (cached?.expiresAt && cached.expiresAt > now) {
    const value = cacheValue(cached.value);
    if (value.accessToken) return value;
  }

  if (!config.officialAppId || !config.officialAppSecret) {
    const value = { accessToken: "mock_official_access_token", mock: true };
    await prisma.integrationCache.upsert({
      where: { key: cacheKey },
      update: { value, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      create: { key: cacheKey, value, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    return value;
  }

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", config.officialAppId);
  url.searchParams.set("secret", config.officialAppSecret);

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as AccessTokenResponse;
  if (!response.ok || data.errcode || !data.access_token) {
    throw new Error(data.errmsg ?? "公众号 access_token 获取失败");
  }

  const value = { accessToken: data.access_token, mock: false };
  const expiresIn = Math.max(60, (data.expires_in ?? 7200) - 300);
  await prisma.integrationCache.upsert({
    where: { key: cacheKey },
    update: { value, expiresAt: new Date(Date.now() + expiresIn * 1000) },
    create: { key: cacheKey, value, expiresAt: new Date(Date.now() + expiresIn * 1000) },
  });

  return value;
}

export async function createOfficialMenu() {
  const config = getWechatConfig();
  const token = await getOfficialAccessToken();
  const appUrl = config.appUrl.replace(/\/$/, "");
  const menu = {
    button: [
      { type: "view", name: "进入商城", url: `${appUrl}/shop` },
      { type: "view", name: "我的订单", url: `${appUrl}/shop/my-orders` },
      { type: "view", name: "领券中心", url: `${appUrl}/shop/coupons` },
    ],
  };

  if (token.mock) {
    await prisma.wechatMessageLog.create({
      data: {
        scene: "official_menu",
        status: "MOCKED",
        payload: toJson(menu),
      },
    });
    return { mocked: true, menu };
  }

  const url = new URL("https://api.weixin.qq.com/cgi-bin/menu/create");
  url.searchParams.set("access_token", token.accessToken ?? "");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(menu),
  });
  const result = (await response.json()) as { errcode?: number; errmsg?: string };
  if (!response.ok || result.errcode) {
    throw new Error(result.errmsg ?? "公众号菜单配置失败");
  }

  await prisma.wechatMessageLog.create({
    data: {
      scene: "official_menu",
      status: "SENT",
      payload: toJson(menu),
      sentAt: new Date(),
    },
  });
  return { mocked: false, menu };
}

export async function sendOrderStatusTemplate(orderId: string, scene: "paid" | "shipped" | "delivered" | "completed" | "cancelled" | "updated") {
  try {
    const config = getWechatConfig();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            wechatOfficialOpenId: true,
            wechatMiniOpenId: true,
          },
        },
      },
    });

    if (!order) return { status: "SKIPPED", reason: "订单不存在" };

    const openId = order.customer.wechatOfficialOpenId;
    const payload: Record<string, unknown> = {
      touser: openId,
      template_id: config.officialOrderTemplateId,
      url: `${config.appUrl.replace(/\/$/, "")}/shop/my-orders/${order.id}`,
      data: {
        first: { value: `华启商城订单 ${orderStatusLabels[order.status]}` },
        keyword1: { value: order.orderNo },
        keyword2: { value: formatCurrency(Number(order.payableAmount)) },
        keyword3: { value: orderStatusLabels[order.status] },
        remark: { value: "感谢使用华启商城，本地配送会尽快处理。" },
      },
    };
    if (config.miniAppId) {
      payload.miniprogram = {
        appid: config.miniAppId,
        pagepath: `pages/order-detail/index?id=${order.id}`,
      };
    }

    if (!openId || !config.officialOrderTemplateId) {
      await prisma.wechatMessageLog.create({
        data: {
          customerId: order.customerId,
          orderId: order.id,
          openId: openId ?? order.customer.wechatMiniOpenId,
          scene: `order_${scene}`,
          templateId: config.officialOrderTemplateId,
          status: "SKIPPED",
          payload: toJson(payload),
          error: !openId ? "客户未绑定公众号 OpenID" : "未配置模板消息 ID",
        },
      });
      return { status: "SKIPPED" };
    }

    const token = await getOfficialAccessToken();
    if (token.mock) {
      await prisma.wechatMessageLog.create({
        data: {
          customerId: order.customerId,
          orderId: order.id,
          openId,
          scene: `order_${scene}`,
          templateId: config.officialOrderTemplateId,
          status: "MOCKED",
          payload: toJson(payload),
        },
      });
      return { status: "MOCKED" };
    }

    const url = new URL("https://api.weixin.qq.com/cgi-bin/message/template/send");
    url.searchParams.set("access_token", token.accessToken ?? "");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { errcode?: number; errmsg?: string };
    if (!response.ok || result.errcode) {
      await prisma.wechatMessageLog.create({
        data: {
          customerId: order.customerId,
          orderId: order.id,
          openId,
          scene: `order_${scene}`,
          templateId: config.officialOrderTemplateId,
          status: "FAILED",
          payload: toJson(payload),
          error: result.errmsg ?? "模板消息发送失败",
        },
      });
      return { status: "FAILED" };
    }

    await prisma.wechatMessageLog.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        openId,
        scene: `order_${scene}`,
        templateId: config.officialOrderTemplateId,
        status: "SENT",
        payload: toJson(payload),
        sentAt: new Date(),
      },
    });
    return { status: "SENT" };
  } catch (error) {
    await prisma.wechatMessageLog.create({
      data: {
        orderId,
        scene: `order_${scene}`,
        status: "FAILED",
        error: error instanceof Error ? error.message : "模板消息发送异常",
      },
    });
    return { status: "FAILED" };
  }
}
