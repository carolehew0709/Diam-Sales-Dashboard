import fs from "node:fs/promises";
import path from "node:path";
import { parseSalesOperations } from "../lib/sales-operations-parser";
import { fileAdapter } from "../lib/storage";

async function main() {
  const args = process.argv.slice(2);
  const publish = args[0] === "--publish-demo";
  const files = publish ? args.slice(1) : args;
  if (files.length !== 4)
    throw new Error(
      "Supply the ERP summary, detail, financial receivables and receipts workbooks, in that order.",
    );
  if (publish && !process.env.DIAM_DATA_PATH)
    throw new Error(
      "Set DIAM_DATA_PATH to the private local demo store before publishing.",
    );
  const [summary, detail, finance, receipts] = await Promise.all(
    files.map(async (file) => ({
      file: path.basename(file),
      bytes: await fs.readFile(file),
    })),
  );
  const snapshot = parseSalesOperations(summary, detail, finance, receipts);
  if (publish) {
    await fileAdapter.transaction((state) => {
      state.salesOperations = snapshot;
    });
  }
  const counts = {
    mode: publish ? "local demo published" : "preview",
    from: snapshot.from,
    asOf: snapshot.asOf,
    orders: new Set(snapshot.lines.map(({ order }) => order)).size,
    lines: snapshot.lines.length,
    shipmentDocuments: new Set(
      snapshot.shipments.map(({ document }) => document),
    ).size,
    receivables: snapshot.receivables.length,
    receivableLinks: snapshot.receivableLinks.length,
    invoices: new Set(snapshot.receivables.flatMap(({ invoices }) => invoices))
      .size,
    assignedLines: snapshot.lines.filter(({ team }) => team !== null).length,
    receiptDocuments: new Set(snapshot.payments.map(({ receipt }) => receipt))
      .size,
    receiptAllocations: snapshot.payments.length,
    actualPaymentsCNY: snapshot.payments
      .filter(({ currency }) => currency === "CNY")
      .reduce((sum, payment) => sum + payment.received, 0)
      .toFixed(2),
  };
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
