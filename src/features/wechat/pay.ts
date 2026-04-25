import { createDecipheriv, createSign, createVerify, randomBytes } from "crypto";
import type { NextRequest } from "next/server";

import { getWechatConfig } from "@/features/wechat/config";

type PrepayInput = {
  orderNo: string;
  amountFen: number;
  openId: string;
  description: string;
};

type WechatPrepayResponse = {
  prepay_id?: string;
  code?: string;
  message?: string;
};

type WechatPayNotification = {
  id?: string;
  resource?: {
    algorithm?: string;
    ciphertext?: string;
    associated_data?: string;
    nonce?: string;
  };
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: { total?: number; payer_total?: number };
};

function nonce() {
  return randomBytes(16).toString("hex");
}

function signWithPrivateKey(message: string, privateKey: string) {
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, "base64");
}

function buildAuthorization(method: string, pathWithQuery: string, body: string) {
  const config = getWechatConfig();
  if (!config.payMchId || !config.paySerialNo || !config.payPrivateKey) {
    throw new Error("微信支付商户配置不完整");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = nonce();
  const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = signWithPrivateKey(message, config.payPrivateKey);
  return {
    timestamp,
    nonceStr,
    header: `WECHATPAY2-SHA256-RSA2048 mchid="${config.payMchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.paySerialNo}"`,
  };
}

function buildPayParams(prepayId: string) {
  const config = getWechatConfig();
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = nonce();
  const packageValue = `prepay_id=${prepayId}`;
  const signType = "RSA";
  const paySign = config.payPrivateKey && config.miniAppId ? signWithPrivateKey(`${config.miniAppId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, config.payPrivateKey) : "mock_pay_sign";

  return {
    appId: config.miniAppId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType,
    paySign,
  };
}

export async function createWechatJsapiPayment(input: PrepayInput) {
  const config = getWechatConfig();
  if (!config.miniAppId || !config.payMchId || !config.paySerialNo || !config.payPrivateKey || !config.payApiV3Key) {
    const prepayId = `mock_prepay_${input.orderNo}`;
    return {
      mocked: true,
      prepayId,
      payParams: buildPayParams(prepayId),
    };
  }

  const path = "/v3/pay/transactions/jsapi";
  const body = JSON.stringify({
    appid: config.miniAppId,
    mchid: config.payMchId,
    description: input.description,
    out_trade_no: input.orderNo,
    notify_url: config.payNotifyUrl,
    amount: {
      total: input.amountFen,
      currency: "CNY",
    },
    payer: {
      openid: input.openId,
    },
  });
  const auth = buildAuthorization("POST", path, body);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: "POST",
    headers: {
      Authorization: auth.header,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });
  const data = (await response.json()) as WechatPrepayResponse;
  if (!response.ok || !data.prepay_id) {
    throw new Error(data.message ?? "微信支付预下单失败");
  }

  return {
    mocked: false,
    prepayId: data.prepay_id,
    payParams: buildPayParams(data.prepay_id),
  };
}

function verifyWechatPaySignature(request: NextRequest, rawBody: string) {
  const config = getWechatConfig();
  if (!config.payPlatformCertificate) {
    return true;
  }

  const timestamp = request.headers.get("wechatpay-timestamp");
  const nonceStr = request.headers.get("wechatpay-nonce");
  const signature = request.headers.get("wechatpay-signature");
  if (!timestamp || !nonceStr || !signature) {
    return false;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonceStr}\n${rawBody}\n`);
  verifier.end();
  return verifier.verify(config.payPlatformCertificate, signature, "base64");
}

function decryptResource(resource: NonNullable<WechatPayNotification["resource"]>) {
  const config = getWechatConfig();
  if (!config.payApiV3Key) {
    throw new Error("未配置 WECHAT_PAY_APIV3_KEY，无法解密支付回调");
  }

  if (!resource.ciphertext || !resource.nonce) {
    throw new Error("微信支付回调缺少加密资源");
  }

  const ciphertext = Buffer.from(resource.ciphertext, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.payApiV3Key), Buffer.from(resource.nonce));
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data));
  }
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as WechatPayNotification;
}

export async function parseWechatPayNotification(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWechatPaySignature(request, rawBody)) {
    throw new Error("微信支付回调签名校验失败");
  }

  const body = JSON.parse(rawBody) as WechatPayNotification;
  const detail = body.resource ? decryptResource(body.resource) : body;
  const orderNo = detail.out_trade_no;
  const transactionId = detail.transaction_id ?? body.id ?? `WECHAT-${orderNo}`;
  const amountFen = detail.amount?.payer_total ?? detail.amount?.total;
  const tradeState = detail.trade_state ?? "SUCCESS";

  if (!orderNo || !transactionId || typeof amountFen !== "number") {
    throw new Error("微信支付回调参数不完整");
  }

  return {
    orderNo,
    transactionId,
    amountFen,
    tradeState,
  };
}
