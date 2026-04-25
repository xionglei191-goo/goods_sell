import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

type WechatTokenPayload = {
  customerId: string;
  openId: string;
  exp: number;
};

function getSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "huaqi-wechat-dev-secret";
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signPart(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function signWechatToken(payload: Omit<WechatTokenPayload, "exp">, ttlSeconds = 60 * 60 * 24 * 30) {
  const body: WechatTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(body));
  return `${encoded}.${signPart(encoded)}`;
}

export function verifyWechatToken(token?: string | null): WechatTokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = signPart(encoded);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as WechatTokenPayload;
    if (!payload.customerId || !payload.openId || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getWechatTokenFromRequest(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  return request.cookies.get("huaqi_wechat_token")?.value ?? null;
}

export function requireWechatSession(request: NextRequest) {
  const payload = verifyWechatToken(getWechatTokenFromRequest(request));
  if (!payload) {
    throw new Error("WECHAT_AUTH_REQUIRED");
  }

  return payload;
}
