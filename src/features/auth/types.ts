import { getDefaultAuthorizedPath } from "@/features/auth/permissions";
import type { AppRole } from "@/features/auth/permissions";

export type { AppRole } from "@/features/auth/permissions";

export type AppAccountType = "STAFF" | "CUSTOMER";

export type AuthUser = {
  id: string;
  name: string;
  phone: string;
  role: AppRole;
  type: AppAccountType;
  image?: string | null;
};

export function getDefaultRedirect(role?: string | null) {
  return getDefaultAuthorizedPath(role);
}

export function isSafeLocalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}
