import * as XLSX from "xlsx";
import { ApiError } from "./auth";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Snapshot } from "./types";
import { isDehkReceiveWorkbook } from "./dehk-receive-parser";
import { isPaymentStatusSheet } from "./payment-status-parser";
export function identifyWorkbook(bytes: Buffer) {
  const book = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const names = book.SheetNames;
  const hasPaymentStatus = names.some(isPaymentStatusSheet);
  const types = [
    names.some((n) => /^W\d+$/.test(n) || n === "Data Weekly") ? "sales" : null,
    names.includes("Customer Contribution & Focus") ||
    names.some((n) => n.startsWith("Entity & Business Unit Breakdow"))
      ? "customer"
      : null,
    names.some((n) => /^(DEHK|DDC) OVERDUE$/.test(n)) ? "aging" : null,
    isDehkReceiveWorkbook(book) ? "dehk-receive-aging" : null,
    names.some(
      (n) =>
        book.Sheets[n].A1?.v === "序号" &&
        book.Sheets[n].Q1?.v === "余额" &&
        book.Sheets[n].L1?.v === "最后到期日",
    )
      ? "ddc-aging"
      : null,
    hasPaymentStatus ? "payments-status" : null,
    !hasPaymentStatus &&
    names.includes("Summary") &&
    names.some((n) => /^(Unknown|Advance)/i.test(n))
      ? "payments"
      : null,
    names.includes("Sheet1") &&
    names.includes("Sales Forecast") &&
    String(book.Sheets.Sheet1.A1?.v ?? "")
      .trim()
      .toUpperCase() === "SALES TEAM1"
      ? "team-actual"
      : null,
  ].filter(Boolean);
  if (types.length !== 1)
    throw new ApiError(
      400,
      "Upload one supported dataset type per batch; mixed or unknown workbook templates cannot be published",
    );
  return types[0]!;
}
export async function archiveWorkbook(bytes: Buffer) {
  const fingerprint = createHash("sha256").update(bytes).digest("hex");
  const root =
    process.env.DIAM_IMPORT_ARCHIVE ??
    (process.env.NODE_ENV === "production" && process.env.DATABASE_URL
      ? "/home/ubuntu/diam-deploy/shared/import-originals"
      : ".local/import-originals");
  if (process.env.VERCEL)
    throw new ApiError(503, "Configure private persistent workbook storage");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(path.join(root, `${fingerprint}.xlsx`), bytes, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return fingerprint;
}
/** Fill only missing derived months with authorized, same-entity/year historical evidence. */
export function supplementMonthlyHistory(
  incoming: Snapshot[],
  published: Snapshot[],
) {
  const all = [
    ...published.filter(
      (p) =>
        !incoming.some(
          (s) =>
            s.entityId === p.entityId && s.year === p.year && s.week === p.week,
        ),
    ),
    ...incoming,
  ];
  for (const s of incoming)
    for (const kind of ["external", "group"] as const)
      for (let m = 1; m < s.month; m++) {
        if (s.monthlySales[kind][m - 1] !== null) continue;
        const last = (month: number) =>
          all
            .filter(
              (p) =>
                p.entityId === s.entityId &&
                p.year === s.year &&
                p.month === month &&
                p.week <= s.week,
            )
            .sort((a, b) => b.week - a.week)[0];
        const end = (p?: Snapshot) =>
          p && p.turnover[kind] !== null && p.monthTurnover[kind] !== null
            ? p.turnover[kind]! - p.monthTurnover[kind]!
            : null;
        const a = last(m + 1),
          b = last(m),
          current = end(a),
          previous = m === 1 ? 0 : end(b);
        if (current !== null && previous !== null) {
          s.monthlySales[kind][m - 1] = current - previous;
          s.sourceCells[`history.${kind}.${m}`] = [a, b]
            .filter(Boolean)
            .map(
              (p) =>
                `${p!.sourceFile} · ${p!.sourceSheet} · FY${p!.year} W${p!.week}`,
            )
            .join("; ");
        }
      }
}
