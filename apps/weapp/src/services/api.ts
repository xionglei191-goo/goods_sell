import Taro from "@tarojs/taro";

export type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? "http://localhost:3000";
const TOKEN_KEY = "huaqi_wechat_token";

export function getToken() {
  return Taro.getStorageSync<string>(TOKEN_KEY);
}

export function setToken(token: string) {
  Taro.setStorageSync(TOKEN_KEY, token);
}

export async function apiRequest<T>(path: string, options: Taro.request.Option = {}) {
  const token = getToken();
  const response = await Taro.request<ApiResult<T>>({
    ...options,
    url: `${API_BASE_URL}${path}`,
    header: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.header,
    },
  });

  if (response.statusCode >= 400 || !response.data.success) {
    throw new Error(response.data.error || "请求失败");
  }

  return response.data.data as T;
}
