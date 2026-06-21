export const appRoles = ["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE", "CONSUMER", "DEALER"] as const;
export const staffRoles = ["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"] as const;

export type AppRole = (typeof appRoles)[number];
export type StaffRole = (typeof staffRoles)[number];

export type DashboardPermission =
  | "dashboard:view"
  | "products:view"
  | "products:write"
  | "inventory:manage"
  | "purchase:manage"
  | "orders:view"
  | "orders:write"
  | "orders:fulfill"
  | "customers:view"
  | "dealers:view"
  | "dealers:approve"
  | "channel:manage"
  | "sales:view"
  | "finance:manage"
  | "warehouse:manage"
  | "delivery:manage"
  | "marketing:manage"
  | "wechat:manage"
  | "receipts:manage"
  | "settings:manage"
  | "logs:manage";

const staffRoleSet = new Set<string>(staffRoles);

export const permissionRoles: Record<DashboardPermission, readonly AppRole[]> = {
  "dashboard:view": staffRoles,
  "products:view": staffRoles,
  "products:write": ["ADMIN"],
  "inventory:manage": ["ADMIN", "WAREHOUSE"],
  "purchase:manage": ["ADMIN", "WAREHOUSE"],
  "orders:view": ["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"],
  "orders:write": ["ADMIN", "SALESPERSON"],
  "orders:fulfill": ["ADMIN", "WAREHOUSE"],
  "customers:view": ["ADMIN", "SALESPERSON", "FINANCE"],
  "dealers:view": ["ADMIN", "SALESPERSON"],
  "dealers:approve": ["ADMIN"],
  "channel:manage": ["ADMIN", "SALESPERSON"],
  "sales:view": ["ADMIN", "SALESPERSON", "FINANCE"],
  "finance:manage": ["ADMIN", "FINANCE"],
  "warehouse:manage": ["ADMIN", "WAREHOUSE"],
  "delivery:manage": ["ADMIN", "WAREHOUSE"],
  "marketing:manage": ["ADMIN", "SALESPERSON"],
  "wechat:manage": ["ADMIN"],
  "receipts:manage": ["ADMIN", "FINANCE"],
  "settings:manage": ["ADMIN"],
  "logs:manage": ["ADMIN"],
};

type RouteRule = {
  prefix?: string;
  pattern?: RegExp;
  roles: readonly AppRole[];
};

const dashboardRouteRules: RouteRule[] = [
  { prefix: "/dashboard/settings", roles: permissionRoles["settings:manage"] },
  { prefix: "/dashboard/logs", roles: permissionRoles["logs:manage"] },
  { prefix: "/dashboard/wechat", roles: permissionRoles["wechat:manage"] },
  { prefix: "/dashboard/receipts", roles: permissionRoles["receipts:manage"] },
  { prefix: "/dashboard/finance", roles: permissionRoles["finance:manage"] },
  { prefix: "/dashboard/inventory", roles: permissionRoles["inventory:manage"] },
  { prefix: "/dashboard/purchase", roles: permissionRoles["purchase:manage"] },
  { prefix: "/dashboard/warehouse", roles: permissionRoles["warehouse:manage"] },
  { prefix: "/dashboard/delivery", roles: permissionRoles["delivery:manage"] },
  { prefix: "/dashboard/products/new", roles: permissionRoles["products:write"] },
  { prefix: "/dashboard/products/categories", roles: permissionRoles["products:write"] },
  { prefix: "/dashboard/products/brands", roles: permissionRoles["products:write"] },
  { prefix: "/dashboard/products/materials", roles: permissionRoles["products:write"] },
  { pattern: /^\/dashboard\/products\/[^/]+\/edit\/?$/, roles: permissionRoles["products:write"] },
  { prefix: "/dashboard/products", roles: permissionRoles["products:view"] },
  { prefix: "/dashboard/orders/new", roles: permissionRoles["orders:write"] },
  { prefix: "/dashboard/orders", roles: permissionRoles["orders:view"] },
  { prefix: "/dashboard/customers", roles: permissionRoles["customers:view"] },
  { prefix: "/dashboard/dealers", roles: permissionRoles["dealers:view"] },
  { prefix: "/dashboard/leads", roles: permissionRoles["channel:manage"] },
  { prefix: "/dashboard/inquiries", roles: permissionRoles["channel:manage"] },
  { prefix: "/dashboard/quotes", roles: permissionRoles["channel:manage"] },
  { prefix: "/dashboard/promoters", roles: permissionRoles["channel:manage"] },
  { prefix: "/dashboard/channel-pilot", roles: permissionRoles["channel:manage"] },
  { prefix: "/dashboard/channel-conflicts", roles: permissionRoles["channel:manage"] },
  { prefix: "/dashboard/product-pushes", roles: permissionRoles["marketing:manage"] },
  { prefix: "/dashboard/marketing", roles: permissionRoles["marketing:manage"] },
  { prefix: "/dashboard/salespeople", roles: permissionRoles["settings:manage"] },
  { prefix: "/dashboard/sales", roles: permissionRoles["sales:view"] },
  { prefix: "/dashboard/map", roles: ["ADMIN", "SALESPERSON", "WAREHOUSE"] },
  { prefix: "/dashboard/pending", roles: staffRoles },
  { prefix: "/dashboard", roles: staffRoles },
];

const protectedShopPrefixes = [
  "/shop/cart",
  "/shop/checkout",
  "/shop/my-orders",
  "/shop/account",
  "/shop/ai-chat",
  "/shop/coupons",
];

export function isStaffRole(role?: string | null): role is StaffRole {
  return Boolean(role && staffRoleSet.has(role));
}

export function normalizeRole(role?: string | null): AppRole | null {
  return appRoles.includes(role as AppRole) ? (role as AppRole) : null;
}

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function routeRuleMatches(pathname: string, rule: RouteRule) {
  if (rule.pattern) return rule.pattern.test(pathname);
  return rule.prefix ? pathMatches(pathname, rule.prefix) : false;
}

export function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/terms" || pathname === "/privacy" || pathname === "/forbidden") {
    return true;
  }

  return (
    pathname === "/shop" ||
    pathname.startsWith("/shop/catalog") ||
    pathname.startsWith("/shop/product") ||
    pathname.startsWith("/shop/scenes") ||
    pathname.startsWith("/shop/channel") ||
    pathname.startsWith("/shop/fun")
  );
}

export function roleHasPermission(role: string | null | undefined, permission: DashboardPermission) {
  const normalized = normalizeRole(role);
  return Boolean(normalized && permissionRoles[permission].includes(normalized));
}

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (isPublicPath(pathname)) return true;

  const normalized = normalizeRole(role);
  if (!normalized) return false;

  if (pathname.startsWith("/dashboard")) {
    const rule = dashboardRouteRules.find((item) => routeRuleMatches(pathname, item));
    return Boolean(rule && rule.roles.includes(normalized));
  }

  if (pathname.startsWith("/dealer")) {
    return normalized === "DEALER";
  }

  if (protectedShopPrefixes.some((prefix) => pathMatches(pathname, prefix))) {
    return normalized === "CONSUMER";
  }

  return true;
}

export function getDefaultAuthorizedPath(role?: string | null) {
  if (role === "DEALER") return "/dealer/incoming";
  if (role === "CONSUMER") return "/shop";
  if (isStaffRole(role)) return "/dashboard";
  return "/login";
}

type NavLike = {
  href: string;
  children?: Array<{ href: string }>;
};

export function filterDashboardNavItems<T extends NavLike>(role: string | null | undefined, items: readonly T[]) {
  const normalized = normalizeRole(role);
  if (!normalized) return [];

  return items
    .map((item) => {
      const allowedChildren = item.children?.filter((child) => canAccessPath(normalized, child.href));
      if (canAccessPath(normalized, item.href)) {
        return { ...item, children: allowedChildren } as T;
      }
      if (allowedChildren?.length) {
        return { ...item, href: allowedChildren[0].href, children: allowedChildren } as T;
      }
      return null;
    })
    .filter((item): item is T => Boolean(item));
}
