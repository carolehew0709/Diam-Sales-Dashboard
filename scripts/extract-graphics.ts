import fs from "node:fs";
import path from "node:path";
import { parseCustomerAnalysisWorkbook } from "../lib/customer-analysis-parser";

const input = process.argv[2];
if (!input)
  throw new Error("Usage: npx tsx scripts/extract-graphics.ts <Graphics.xlsx>");
const parsed = parseCustomerAnalysisWorkbook(
  fs.readFileSync(input),
  path.basename(input),
);
if (!parsed || parsed.findings.some((f) => f.severity === "error"))
  throw new Error(
    JSON.stringify(parsed?.findings ?? "Monthly customer sheets not found"),
  );
fs.writeFileSync(
  "data/customer-analysis.json",
  JSON.stringify(
    {
      source: path.basename(input),
      analyses: [parsed.customerAnalysis],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Validated ${parsed.sheets.length} sheets; extracted customer month ${parsed.customerAnalysis.month}. Original unchanged.`,
);
