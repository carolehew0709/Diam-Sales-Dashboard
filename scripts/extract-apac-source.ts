import fs from "node:fs";
import path from "node:path";
import { parseDashboardWorkbook } from "../lib/workbook-parser";
const root = process.cwd();
const files: string[] = JSON.parse(
  fs.readFileSync(path.join(root, "Dashboard/source-manifest.json"), "utf8"),
).files;
const parsed = files.map((f) =>
  parseDashboardWorkbook(fs.readFileSync(path.join(root, "Dashboard", f)), f),
);
const snapshots = parsed.flatMap((p) => p.snapshots);
const lines = parsed.flatMap((p) => p.lines);
const output = {
  meta: { fiscalYear: 2026, unit: "kEUR", sourceFiles: files, generatedAt: new Date().toISOString() },
  snapshots,
  lines,
  findings: parsed.flatMap((p) => p.findings),
};
fs.writeFileSync(
  path.join(root, "data/apac-dashboard.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  `Extracted ${snapshots.length} populated entity-week snapshots and ${lines.length} order lines. Original workbooks unchanged.`,
);
