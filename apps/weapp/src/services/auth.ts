import Taro from "@tarojs/taro";

import { apiRequest, setToken } from "@/services/api";

type LoginResult = {
  token: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    points: number;
    avatar: string | null;
  };
  isNew: boolean;
  mock: boolean;
};

export async function loginWithWechat() {
  const login = await Taro.login();
  const result = await apiRequest<LoginResult>("/api/wechat/mini/login", {
    method: "POST",
    data: {
      code: login.code,
      profile: {},
    },
  });
  setToken(result.token);
  return result;
}
