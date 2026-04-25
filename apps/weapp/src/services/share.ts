import { apiRequest } from "@/services/api";

export function trackShare(input: { scene: string; title: string; path: string; target?: string }) {
  return apiRequest<void>("/api/wechat/mini/share", {
    method: "POST",
    data: input,
  }).catch(() => undefined);
}
