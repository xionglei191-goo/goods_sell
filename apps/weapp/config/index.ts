import { defineConfig, type UserConfigExport } from "@tarojs/cli";

export default defineConfig(async () => {
  const config: UserConfigExport = {
    projectName: "huaqi-mall-weapp",
    date: "2026-04-25",
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: "src",
    outputRoot: "dist",
    plugins: ["@tarojs/plugin-platform-weapp"],
    defineConstants: {
      "process.env.TARO_APP_API_BASE_URL": JSON.stringify(process.env.TARO_APP_API_BASE_URL ?? "http://localhost:3000"),
    },
    framework: "react",
    compiler: "webpack5",
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
      },
    },
  };

  return config;
});
