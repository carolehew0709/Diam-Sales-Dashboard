import fs from "node:fs";
import { parseReceivablesWorkbook } from "../lib/receivables-parser";
const files = ["DEHK+DDC OVERDUE.xlsx", "Unknown Payment.xlsx"];
const parsed = files.map((file) =>
  parseReceivablesWorkbook(fs.readFileSync(`Dashboard/${file}`), file, {
    paymentEntityId: "china-payments",
  }),
);
if (parsed.some((p) => p.findings.some((f) => f.severity === "error")))
  throw new Error("Resolve receivables validation errors before extraction");
const output = {
  meta: {
    sourceFiles: files,
    generatedAt: new Date().toISOString(),
    sourceDate: "2026-09-30",
    rules:
      "2026-10-19 owner confirmation: source aging; Due=Not Due; payments have no BU filter; separate EUR/RMB; Summary EUR balance without duplicate detail",
  },
  records: parsed.flatMap((p) => p.records),
  findings: parsed.flatMap((p) => p.findings),
};
fs.writeFileSync("data/ar-aging.json", JSON.stringify(output, null, 2) + "\n");
console.log(
  `Extracted ${output.records.length} source receivables/receipt records; originals unchanged. Publish via import review before activation.`,
);
