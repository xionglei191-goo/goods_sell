const baseUrl = process.env.PHASE5_BASE_URL ?? "http://localhost:3000";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`Phase 5 smoke base: ${baseUrl}`);

  const publicHome = await request("/api/wechat/mini/home");
  assert(publicHome.response.status === 200, "小程序首页 API 应返回 200");

  const publicCatalog = await request("/api/wechat/mini/catalog?category=drink");
  assert(publicCatalog.response.status === 200, "小程序目录 API 应返回 200");

  const protectedCart = await request("/api/wechat/mini/cart");
  assert(protectedCart.response.status === 401, "未登录购物车 API 应返回 401");

  const login = await request("/api/wechat/mini/login", {
    method: "POST",
    body: JSON.stringify({ code: "mock-phase5-smoke", profile: { nickName: "Phase5 Smoke" } }),
  });
  assert(login.response.status === 200, "模拟微信登录应返回 200");
  const token = (login.body as { data?: { token?: string } }).data?.token;
  assert(token, "模拟微信登录应返回 token");

  const authedCart = await request("/api/wechat/mini/cart", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(authedCart.response.status === 200, "已登录购物车 API 应返回 200");

  const share = await request("/api/wechat/mini/share", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ scene: "smoke", title: "华启商城 Smoke", path: "/pages/index/index" }),
  });
  assert(share.response.status === 200, "分享记录 API 应返回 200");

  const menu = await request("/api/wechat/official/menu", { method: "POST" });
  assert(menu.response.status === 403, "未登录后台同步公众号菜单应返回 403");

  console.log("Phase 5 smoke passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
