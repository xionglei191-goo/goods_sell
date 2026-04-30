import { execFileSync } from "child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const LOCAL_ENV = ".env.local";
const DEPLOY_ENV = ".env.deploy.local";
const REMOTE_ENV_PATH = "/data/goods_sell/.env";
const AI_KEY_PATTERN = /^(AI_|DASHSCOPE_|DEEPSEEK_|OPENAI_|ANTHROPIC_)/;

function parseEnv(text: string) {
  const result = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result.set(key, value);
  }
  return result;
}

function expandHome(value: string) {
  if (!value.startsWith("~")) return value;
  return join(homedir(), value.slice(2));
}

function sshArgs(deploy: Map<string, string>) {
  const args = ["-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=6"];
  const key = deploy.get("DEPLOY_SSH_KEY")?.replace(/^["']|["']$/g, "");
  if (key) args.push("-i", expandHome(key), "-o", "IdentitiesOnly=yes");
  const user = deploy.get("DEPLOY_USER")?.replace(/^["']|["']$/g, "") || "root";
  const host = deploy.get("DEPLOY_HOST")?.replace(/^["']|["']$/g, "") || "103.229.126.92";
  return [...args, `${user}@${host}`];
}

function updateLocalEnv(localText: string, updates: Map<string, string>) {
  const touched = new Set<string>();
  const lines = localText.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return line;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (!updates.has(key)) return line;
    touched.add(key);
    return `${key}=${updates.get(key)}`;
  });

  for (const [key, value] of updates) {
    if (!touched.has(key)) lines.push(`${key}=${value}`);
  }

  return lines.join("\n").replace(/\n*$/, "\n");
}

function main() {
  if (!existsSync(DEPLOY_ENV)) throw new Error(`缺少 ${DEPLOY_ENV}`);
  if (!existsSync(LOCAL_ENV)) throw new Error(`缺少 ${LOCAL_ENV}`);

  const deploy = parseEnv(readFileSync(DEPLOY_ENV, "utf8"));
  const remoteText = execFileSync("ssh", [...sshArgs(deploy), `cat ${REMOTE_ENV_PATH}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const remote = parseEnv(remoteText);
  const updates = new Map([...remote.entries()].filter(([key, value]) => AI_KEY_PATTERN.test(key) && value.trim().length > 0));
  if (updates.size === 0) throw new Error("远端未找到 AI provider 相关配置");

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const backup = `.env.local.backup-ai-provider-${timestamp}`;
  copyFileSync(LOCAL_ENV, backup);
  const next = updateLocalEnv(readFileSync(LOCAL_ENV, "utf8"), updates);
  writeFileSync(LOCAL_ENV, next, "utf8");

  console.log(`AI provider env synced. backup=${backup}`);
  for (const key of updates.keys()) {
    console.log(`${key}=SET`);
  }
}

main();
