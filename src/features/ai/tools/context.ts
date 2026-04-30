import { getSessionUser } from "@/features/auth/guards";
import { isStaffRole } from "@/features/auth/permissions";
import type { AiToolContext } from "@/features/ai/tools/types";

export class AiAuthError extends Error {
  status = 401;
}

export async function getAiToolContext(): Promise<AiToolContext> {
  const user = await getSessionUser();
  if (!user) {
    throw new AiAuthError("请先登录后再使用 AI 助手");
  }

  return {
    user,
    role: user.role,
    isStaff: isStaffRole(user.role),
  };
}
