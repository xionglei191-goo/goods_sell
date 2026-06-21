import { getSystemCompletenessReport } from "@/features/system/system-completeness";

const report = getSystemCompletenessReport();

console.log(`System completeness: ${report.status}`);
console.log(`Checked at: ${report.checkedAt}`);
console.log(`READY ${report.readyCount} / TODO ${report.todoCount} / WARNING ${report.warningCount} / BLOCKER ${report.blockerCount}`);

for (const mod of report.modules) {
  console.log(`\n[${mod.status}] ${mod.area} / ${mod.label}`);
  console.log(`  ${mod.summary}`);
  for (const item of mod.items) {
    const mark = item.severity === "READY" ? "OK" : item.severity;
    console.log(`  - [${mark}] ${item.label}: ${item.summary}`);
    if (item.severity !== "READY") {
      console.log(`    action: ${item.action}`);
      console.log(`    evidence: ${item.evidence.join(" | ")}`);
    }
  }
}

if (report.blockerCount > 0) {
  process.exitCode = 1;
}
