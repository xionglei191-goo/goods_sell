import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";

import { getWechatConfig } from "@/features/wechat/config";
import { signWechatToken } from "@/features/wechat/session";
import { prisma } from "@/lib/prisma";

type WechatCodeSession = {
  openid: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

export type MiniLoginProfile = {
  nickName?: string;
  avatarUrl?: string;
  phone?: string;
};

function mockOpenId(code: string) {
  const digest = createHash("sha256").update(code).digest("hex").slice(0, 24);
  return `mock_mini_${digest}`;
}

function miniPhone(openId: string) {
  const numeric = createHash("sha1")
    .update(openId)
    .digest("hex")
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) % 10))
    .slice(0, 11);
  return `wx${numeric}`.slice(0, 16);
}

export async function codeToMiniSession(code: string): Promise<WechatCodeSession & { mock: boolean }> {
  const config = getWechatConfig();
  if (!config.miniAppId || !config.miniAppSecret || code.startsWith("mock-")) {
    return {
      openid: mockOpenId(code),
      unionid: `mock_union_${mockOpenId(code).slice(-12)}`,
      session_key: "mock_session_key",
      mock: true,
    };
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.miniAppId);
  url.searchParams.set("secret", config.miniAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as WechatCodeSession;
  if (!response.ok || data.errcode) {
    throw new Error(data.errmsg ?? "微信登录凭证校验失败");
  }

  return { ...data, mock: false };
}

export async function loginMiniProgram(code: string, profile: MiniLoginProfile = {}) {
  if (!code.trim()) {
    throw new Error("缺少 wx.login 返回的 code");
  }

  const session = await codeToMiniSession(code.trim());
  const now = new Date();
  const existingByOpenId = await prisma.customer.findUnique({
    where: { wechatMiniOpenId: session.openid },
    select: { id: true, name: true, phone: true, avatar: true, points: true },
  });

  if (existingByOpenId) {
    await prisma.customer.update({
      where: { id: existingByOpenId.id },
      data: {
        wechatSessionKey: session.session_key,
        wechatUnionId: session.unionid ?? undefined,
        wechatBoundAt: now,
      },
    });

    return {
      token: signWechatToken({ customerId: existingByOpenId.id, openId: session.openid }),
      customer: existingByOpenId,
      isNew: false,
      mock: session.mock,
    };
  }

  const linkedByPhone = profile.phone
    ? await prisma.customer.findUnique({
        where: { phone: profile.phone },
        select: { id: true, name: true, phone: true, avatar: true, points: true },
      })
    : null;

  if (linkedByPhone) {
    const customer = await prisma.customer.update({
      where: { id: linkedByPhone.id },
      data: {
        name: profile.nickName || linkedByPhone.name,
        avatar: profile.avatarUrl || linkedByPhone.avatar,
        wechatMiniOpenId: session.openid,
        wechatUnionId: session.unionid,
        wechatSessionKey: session.session_key,
        wechatBoundAt: now,
        isVerified: true,
      },
      select: { id: true, name: true, phone: true, avatar: true, points: true },
    });

    return {
      token: signWechatToken({ customerId: customer.id, openId: session.openid }),
      customer,
      isNew: false,
      mock: session.mock,
    };
  }

  const password = await hash(randomBytes(18).toString("hex"), 12);
  const customer = await prisma.customer.create({
    data: {
      name: profile.nickName || "微信用户",
      phone: profile.phone || miniPhone(session.openid),
      password,
      type: "CONSUMER",
      avatar: profile.avatarUrl,
      isVerified: true,
      wechatMiniOpenId: session.openid,
      wechatUnionId: session.unionid,
      wechatSessionKey: session.session_key,
      wechatBoundAt: now,
    },
    select: { id: true, name: true, phone: true, avatar: true, points: true },
  });

  return {
    token: signWechatToken({ customerId: customer.id, openId: session.openid }),
    customer,
    isNew: true,
    mock: session.mock,
  };
}
