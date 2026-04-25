import { PropsWithChildren } from "react";
import Taro, { useLaunch } from "@tarojs/taro";

import "./app.scss";

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    void Taro.setStorage({ key: "huaqi_launch_at", data: Date.now() });
  });

  return children;
}
