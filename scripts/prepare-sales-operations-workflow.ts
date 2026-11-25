import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseOperationsRegister } from "../lib/sales-operations-workflow-parser";
import { operationsStageTotals } from "../lib/sales-operations-workflow";
import type { OperationsWorkflowSources } from "../lib/sales-operations-workflow-types";

async function main() {
  const [from, asOf, ddcOrders, dehkOrders, ddcReceipts, output] =
    process.argv.slice(2);
  if (!output)
    throw new Error(
      "Supply FROM AS_OF DDC_ORDERS DEHK_ORDERS DDC_RECEIPTS OUTPUT; review writes a private file only",
    );
  const workbook = async (file: string) => ({
    file: path.basename(file),
    bytes: await readFile(file),
  });
  const sources: OperationsWorkflowSources = {
    orders: [
      parseOperationsRegister(
        await workbook(ddcOrders),
        "orders",
        "DDC",
        from,
        asOf,
      ),
      parseOperationsRegister(
        await workbook(dehkOrders),
        "orders",
        "DEHK",
        from,
        asOf,
      ),
    ],
    receipts: [
      parseOperationsRegister(
        await workbook(ddcReceipts),
        "receipts",
        "DDC",
        from,
        asOf,
      ),
    ],
    invoices: [],
  };
  await writeFile(output, JSON.stringify(sources), { flag: "wx", mode: 0o600 });
  const out = Object.fromEntries(
    Object.entries(sources).map(([stage, datasets]) => [
      stage,
      datasets.map((dataset) => ({
        entity: dataset.entity,
        ...operationsStageTotals(
          dataset.records.filter(
            (row) => stage !== "receipts" || row.division === "external",
          ),
        ),
        ...(stage === "receipts"
          ? {
              internal: dataset.records.filter(
                (row) => row.division === "internal",
              ).length,
              unknown: dataset.records.filter(
                (row) => row.division === "unknown",
              ).length,
            }
          : {}),
      })),
    ]),
  );
  console.log(JSON.stringify({ from, asOf, ...out }));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
