import { auth } from "@/auth";
import {
  normalizeRole,
  permissionRoles,
  roleHasPermission,
  type AppRole,
  type DashboardPermission,
} from "@/features/auth/permissions";

export type SessionUser = {
  id: string;
  name?: string | null;
  phone?: string | null;
  role: AppRole;
  type?: string | null;
};

function unauthorized(message = "无权限执行该操作") {
  return new Error(message);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const role = normalizeRole(session?.user.role);
  if (!session?.user.id || !role) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    phone: session.user.phone,
    role,
    type: session.user.type,
  };
}

export async function requireRole(roles: readonly AppRole[], message?: string) {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role)) {
    throw unauthorized(message);
  }
  return user;
}

export async function requireDashboardPermission(permission: DashboardPermission, message?: string) {
  const user = await getSessionUser();
  if (!user || !roleHasPermission(user.role, permission)) {
    throw unauthorized(message ?? `无权限执行该操作，需要角色：${permissionRoles[permission].join("/")}`);
  }
  return user;
}
