/**
 * Runtime environment variable validation.
 * Import this in root layout to fail-fast on missing critical env vars.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ 缺少必需的环境变量: ${key}，请检查 .env 文件`);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

export const env = {
  /** PostgreSQL 数据库连接字符串 */
  DATABASE_URL: requireEnv("DATABASE_URL"),

  /** Auth.js 认证密钥 */
  AUTH_SECRET: requireEnv("AUTH_SECRET"),

  /** 高德地图 Key (可选) */
  AMAP_KEY: optionalEnv("AMAP_KEY"),

  /** AI API Base URL (可选) */
  AI_BASE_URL: optionalEnv("AI_BASE_URL"),

  /** AI API Key (可选) */
  AI_API_KEY: optionalEnv("AI_API_KEY"),

  /** AI 模型名称 (可选) */
  AI_MODEL: optionalEnv("AI_MODEL"),

  /** 应用名称 */
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "华启商城",

  /** 应用 URL */
  APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
} as const;
