# 生产环境部署实战避坑指南 (Next.js + NextAuth + PM2 + Cloudflare)

在将本应用部署至云服务器（VPS）并配置生产环境的过程中，我们遇到了几个非常经典的由**多层网络代理**与**安全校验机制**引起的连环错误。现将这些经验教训总结如下，以备将来参考。

## 1. Auth.js 的 `UntrustedHost` 防护机制
**现象**：应用能正常访问首页，但只要涉及鉴权相关的 API 请求（如 `/api/auth/session`）或尝试登录，都会导致内部抛出 `UntrustedHost` 错误以及后续的 `Cannot read properties of undefined (reading 'id')`。
**原因**：NextAuth v5 (Auth.js) 强制的安全要求。当应用跑在 Nginx 等反向代理之后，它检测到 Host 请求头（可能是 127.0.0.1 或内网 IP）与设定的环境不符，为了防止主机头注入攻击，它会默认拒绝一切请求。
**解决方案**：
在生产环境的 `.env` 中必须明确添加：
```env
AUTH_TRUST_HOST="true"
AUTH_URL="https://shop.xionglei.online"
```

## 2. PM2 环境变量刷新陷阱 (`--update-env`)
**现象**：修改了 `.env` 文件并执行了 `pm2 restart goods_sell`，但发现应用依然抛出 `UntrustedHost` 错误，仿佛环境变量根本没有修改。
**原因**：PM2 在执行 `restart` 命令时，**默认会使用该进程最初通过 `start` 启动时缓存的环境变量快照**，并不会自动读取物理硬盘上被修改后的 `.env` 文件。
**解决方案**：
当环境变量发生变动时，必须携带 `--update-env` 参数来强制刷新内存：
```bash
pm2 restart goods_sell --update-env
```

## 3. Cloudflare 灵活 SSL 与 Nginx 的 HTTPS 协议冲突 (`MissingCSRF`)
**现象**：后台打印报错 `[auth][error] MissingCSRF: CSRF token was missing during an action callback.`。
**原因**：
1. 域名配置在 Cloudflare 上并开启了“Flexible (灵活)” SSL 模式。这意味着用户到 Cloudflare 是加密的 `HTTPS`，但 Cloudflare 到我们的 VPS 是 `HTTP` (80端口)。
2. Nginx 配置了 `proxy_set_header X-Forwarded-Proto $scheme;`，因为 Nginx 监听在 80，所以 `$scheme` 被错误地解析为 `http`。
3. NextAuth 收到转发后，认为当前身处 `http` 的不安全环境，因此下发了非安全的 CSRF Token Cookie，但此时因为 `AUTH_URL` 为 `https` 从而发生了跨域 / 跨协议的冲突，导致浏览器验证 Cookie 失败。
**解决方案**：
在处理来自 Cloudflare 的单向加密代理时，Nginx 应当硬编码强制传递安全协议：
```nginx
proxy_set_header X-Forwarded-Proto https;
```

## 4. NextAuth v5 Middleware 的安全 Cookie 识别盲区 (无限重定向登录页)
**现象**：成功执行了账号密码登录动作（甚至可以看到接口返回 200/302），但是页面跳转到管理后台 `/dashboard` 后又立马被重定向回了 `/login`。
**原因**：
1. 生产环境开启了 HTTPS，NextAuth v5 非常智能地将生成的 Session Cookie 提升为了带 `__Secure-` 前缀的安全级 Cookie（即 `__Secure-authjs.session-token`）。
2. 在 Next.js 路由守卫 `middleware.ts` 中，我们使用了 `getToken()` 函数来读取用户的会话状态。
3. `getToken()` 此时无法仅凭中间件底层的 request 自动判断出应该去读哪一个 Cookie 的名字（它默认去读了没有加密前缀的 `authjs.session-token`），导致它永远认为用户是“未登录”的。
**解决方案**：
在使用 `getToken` 时，根据 `NODE_ENV` 显式指示生产环境的 `secureCookie` 状态和对应的 Cookie 名称 (`salt`)：
```typescript
const isProduction = process.env.NODE_ENV === "production";
const token = await getToken({
  req: request,
  secret: process.env.AUTH_SECRET,
  secureCookie: isProduction,
  salt: isProduction ? "__Secure-authjs.session-token" : "authjs.session-token",
});
```
*(注：官方虽然推荐在 V5 废弃 `getToken` 而改用 `auth()` 高阶函数包装中间件，但如果是兼容旧版写法，明确配置 `salt` 是最稳妥的修复手段。)*
