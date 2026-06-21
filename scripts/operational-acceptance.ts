import { getOperationalAcceptanceReport } from "@/features/system/operational-acceptance";

const report = getOperationalAcceptanceReport();

console.log(`Operational acceptance: ${report.status}`);
console.log(`Checked at: ${report.checkedAt}`);
console.log(`READY ${report.readyCount} / WARNING ${report.warningCount} / BLOCKER ${report.blockerCount}`);

for (const item of report.items) {
  const mark = item.severity === "READY" ? "OK" : item.severity === "WARNING" ? "WARN" : "BLOCK";
  console.log(`[${mark}] ${item.area} / ${item.label}: ${item.summary}`);
  if (item.severity !== "READY") {
    console.log(`  action: ${item.action}`);
    console.log(`  evidence: ${item.evidence.join(" | ")}`);
  }
}

if (report.blockerCount > 0) {
  process.exitCode = 1;
}
