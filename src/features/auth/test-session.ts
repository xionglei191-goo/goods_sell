import { normalizeRole, type AppRole } from "@/features/auth/permissions";

export type TestSessionUser = {
  id: string;
  name?: string | null;
  phone?: string | null;
  role: AppRole;
  type?: string | null;
};

function isGoodsSellTestDatabase() {
  return /[?&]schema=goods_sell_test(?:&|$)/.test(process.env.DATABASE_URL ?? "");
}

export function getTestSessionUserFromEnv(): TestSessionUser | null {
  const raw = process.env.AI_TOOL_TEST_SESSION_USER;
  if (!raw || !isGoodsSellTestDatabase()) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<TestSessionUser>;
    const role = normalizeRole(parsed.role);
    if (!parsed.id || !role) return null;
    return {
      id: parsed.id,
      name: parsed.name ?? null,
      phone: parsed.phone ?? null,
      role,
      type: parsed.type ?? (role === "CONSUMER" || role === "DEALER" ? "CUSTOMER" : "STAFF"),
    };
  } catch {
    return null;
  }
}
