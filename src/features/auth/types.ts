import type { UserRole } from "@prisma/client";

export type AppRole = UserRole | "CONSUMER" | "DEALER";
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
  if (role === "DEALER") {
    return "/dealer/incoming";
  }

  if (role === "CONSUMER") {
    return "/shop";
  }

  return "/dashboard";
}

export function isSafeLocalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}
