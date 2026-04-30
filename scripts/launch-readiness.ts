import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { getLaunchReadinessReport } from "@/features/system/launch-readiness";

function parseEnvFile(path: string) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function loadLocalEnv() {
  return {
    ...parseEnvFile(resolve(process.cwd(), ".env")),
    ...parseEnvFile(resolve(process.cwd(), ".env.local")),
    ...process.env,
  };
}

const report = getLaunchReadinessReport(loadLocalEnv());

console.log(`Launch readiness: ${report.status}`);
console.log(`READY ${report.readyCount} / WARNING ${report.warningCount} / BLOCKER ${report.blockerCount}`);

for (const item of report.items) {
  const mark = item.severity === "READY" ? "OK" : item.severity === "WARNING" ? "WARN" : "BLOCK";
  console.log(`[${mark}] ${item.label}: ${item.summary}`);
  if (!item.configured) {
    console.log(`  action: ${item.action}`);
    console.log(`  vars: ${item.variables.join(", ")}`);
  }
}

if (report.blockerCount > 0) {
  process.exitCode = 1;
}
