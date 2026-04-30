import { revalidatePath as nextRevalidatePath, revalidateTag as nextRevalidateTag } from "next/cache";

function isExpectedOutOfRequestRevalidateError(error: unknown) {
  return error instanceof Error && /static generation store missing/i.test(error.message);
}

function isAiToolTestSession() {
  return Boolean(process.env.AI_TOOL_TEST_SESSION_USER && /[?&]schema=goods_sell_test(?:&|$)/.test(process.env.DATABASE_URL ?? ""));
}

export function revalidatePath(path: string, type?: "layout" | "page") {
  try {
    return nextRevalidatePath(path, type);
  } catch (error) {
    if (isAiToolTestSession() && isExpectedOutOfRequestRevalidateError(error)) return;
    throw error;
  }
}

export function revalidateTag(tag: string) {
  try {
    return nextRevalidateTag(tag);
  } catch (error) {
    if (isAiToolTestSession() && isExpectedOutOfRequestRevalidateError(error)) return;
    throw error;
  }
}
