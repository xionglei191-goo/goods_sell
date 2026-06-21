import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src/app", "src/features", "src/components"];
const extensions = new Set([".ts", ".tsx", ".css"]);

const banned = [
  { pattern: /focus:(?:border|ring)-blue/g, label: "blue focus state" },
  { pattern: /\bbg-white(?!\/)\b/g, label: "solid white block background" },
  { pattern: /\bbg-slate-(?:50|100|200|800|900|950)\b/g, label: "slate block background" },
  { pattern: /\bborder-neutral-200\b/g, label: "neutral border block" },
  { pattern: /\bborder-slate-200\b/g, label: "slate border block" },
];

const allowRules = [
  /src\/app\/globals\.css/,
  /src\/features\/shop\/HeroCarousel\.tsx/,
  /src\/features\/shop\/ProductArt\.tsx/,
  /src\/app\/\(dashboard\)\/dashboard\/logs\/page\.tsx/,
  /src\/app\/\(shop\)\/shop\/account\/page\.tsx/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return walk(path);
    const dot = path.lastIndexOf(".");
    const ext = dot >= 0 ? path.slice(dot) : "";
    return extensions.has(ext) ? [path] : [];
  });
}

function isAllowed(file: string, line: string) {
  const normalized = file.split("\\").join("/");
  if (!allowRules.some((rule) => rule.test(normalized))) return false;
  if (normalized.endsWith("globals.css")) return true;
  if (line.includes("bg-white/")) return true;
  if (line.includes("bg-slate-950") && line.includes("<pre")) return true;
  return normalized.includes("ProductArt.tsx") && line.includes("rgba(255, 255, 255");
}

const findings: string[] = [];

for (const root of roots) {
  for (const file of walk(root)) {
    const rel = relative(process.cwd(), file);
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of banned) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line) && !isAllowed(rel, line)) {
          findings.push(`${rel}:${index + 1} ${rule.label}: ${line.trim()}`);
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error("UI visual audit failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("UI visual audit passed");
