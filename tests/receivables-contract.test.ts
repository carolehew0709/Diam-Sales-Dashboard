// Synthetic parser contracts only. Private customer sources never enter GitHub/CI.
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseReceivablesWorkbook } from "../lib/receivables-parser";
import { getReceivables, defaultReceivablesFilters } from "../lib/receivables";
import type { Store, User } from "../lib/types";
import type { ReceivableRecord } from "../lib/receivables-types";

const admin = {
  id: "test",
  role: "superadmin",
  region: "APAC",
  permissions: {},
} as User;
const india = {
  ...admin,
  role: "editor",
  permissions: { ddi: ["view", "edit"] },
} as User;
const bytes = (sheets: Record<string, unknown[][]>) => {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
function invoice(
  amount: number,
  currency: "EUR" | "RMB",
  bucket: string,
  id: string,
) {
  const row: unknown[] = Array(20).fill(null);
  Object.assign(row, {
    0: "2026-09-01",
    1: id,
    2: id,
    13: 30,
    14: bucket === "Not Due" ? 0 : 10,
    15: bucket,
    16: "External",
    17: "Test Team",
    18: "Test PIC",
    [currency === "EUR" ? 10 : 9]: amount,
  });
  return row;
}
const agingBytes = () =>
  bytes({
    "DEHK OVERDUE": [
      [...Array(14).fill(null), 46295],
      ["Date", "InvoiceNumber", "Customer"],
      invoice(100, "EUR", "Not Due", "Test A"),
      invoice(200, "EUR", "1-30days", "Test B"),
      [null, null, "TOTAL", null, null, null, null, null, null, null, 99999],
    ],
    "DDC OVERDUE": [
      [...Array(14).fill(null), 46295],
      ["Date", "InvoiceNumber", "Customer"],
      invoice(1000, "RMB", "Not Due", "Test C"),
      invoice(-100, "RMB", "1-30days", "Test D"),
    ],
    "Sept Invoice": [
      ["Date"],
      invoice(99999, "EUR", "Not Due", "Excluded Test"),
    ],
  });
const paymentSheets = () => ({
  Summary: [
    [
      "#",
      "Year",
      "Date",
      "Payer",
      "Currency",
      "Received",
      "Balance",
      "Balance(EUR)",
      "Slip",
      "Note",
      "Customer",
      "Sale Team",
      "PIC",
    ],
    [
      1,
      2026,
      "2026-09-20",
      "Test payer",
      "USD",
      200,
      100,
      80,
      "Y",
      "",
      "Test A",
      "Test Team",
      "Test PIC",
    ],
    [
      2,
      2026,
      "2026-09-21",
      "Test advance",
      "EUR",
      50,
      50,
      50,
      "Y",
      "",
      "Test B",
      "Test Team",
      "Test PIC",
    ],
  ],
  Unknown: [
    ["#", "Year", "Date", "Payer", "Currency", "Received", "Balance"],
    [1, 2026, "2026-09-20", "Test payer", "USD", 200, 100],
  ],
  Advance: [
    ["#", "Year", "Date", "Payer", "Currency", "Received", "Balance"],
    [2, 2026, "2026-09-21", "Test advance", "EUR", 50, 50],
  ],
});
const options = { paymentEntityId: "china-payments" };
const parsed = () => [
  ...parseReceivablesWorkbook(agingBytes(), "Test aging.xlsx", options).records,
  ...parseReceivablesWorkbook(
    bytes(paymentSheets()),
    "Test receipts.xlsx",
    options,
  ).records,
];
const state = (receivables = parsed()): Store => ({
  version: 2,
  revision: 1,
  snapshots: [],
  lines: [],
  batches: [],
  users: [],
  audit: [],
  receivables,
});

test("parser contract excludes footers and extra sheets, preserves signed native currencies and source evidence", () => {
  const result = parseReceivablesWorkbook(
    agingBytes(),
    "Test aging.xlsx",
    options,
  );
  assert.equal(result.records.length, 4);
  assert.deepEqual(result.findings, []);
  assert.equal(result.records[3].amount, -100);
  assert.equal(result.records[3].currency, "RMB");
  assert.ok(result.records.every((r) => r.asOfDate === "2026-09-30"));
  assert.deepEqual(
    result.records.map((r) => r.sourceRow),
    [3, 4, 3, 4],
  );
});
test("receipt contract uses converted Summary balance exactly once; classification mismatch blocks publication", () => {
  const result = parseReceivablesWorkbook(
    bytes(paymentSheets()),
    "Test receipts.xlsx",
    options,
  );
  assert.deepEqual(result.findings, []);
  assert.deepEqual(
    result.records.map((r) => [r.category, r.amount, r.originalBalance]),
    [
      ["unknown", 80, 100],
      ["advance", 50, 50],
    ],
  );
  const bad = paymentSheets();
  bad.Unknown[1][6] = 101;
  assert.ok(
    parseReceivablesWorkbook(bytes(bad), "Bad.xlsx", options).findings.some(
      (f) => f.severity === "error",
    ),
  );
});
test("aggregation contract reconciles currencies independently and keeps shared receipts out of India/one-BU scopes", () => {
  const data = getReceivables(state(), admin, defaultReceivablesFilters);
  assert.deepEqual(
    data.totals.map((t) => [
      t.currency,
      t.ar,
      t.due,
      t.overdue,
      t.unknown,
      t.advance,
    ]),
    [
      ["EUR", 300, 100, 200, 80, 50],
      ["RMB", 900, 1000, -100, null, null],
    ],
  );
  const hidden = getReceivables(state(), india, defaultReceivablesFilters);
  assert.deepEqual(hidden.rows, []);
  assert.deepEqual(hidden.payments, []);
  assert.deepEqual(hidden.sourceFiles, []);
  const single = { ...india, permissions: { dhk: ["view"] } } as User;
  assert.deepEqual(
    getReceivables(state(), single, defaultReceivablesFilters).payments,
    [],
  );
});
test("BU and aging do not filter shared receipts, including top10 mode; customer and team still filter", () => {
  const all = getReceivables(state(), admin, {
    ...defaultReceivablesFilters,
    customerGroup: "top10",
  });
  const subset = getReceivables(state(), admin, {
    ...defaultReceivablesFilters,
    customerGroup: "top10",
    bu: "DDC",
    aging: "1-30",
  });
  assert.deepEqual(subset.payments, all.payments);
  assert.equal(subset.rows.length, 1);
  assert.equal(
    getReceivables(state(), admin, {
      ...defaultReceivablesFilters,
      salesTeam: "Other team",
    }).payments.length,
    0,
  );
});
test("per-currency top10 and other cohorts partition customers without conversion", () => {
  const template = parsed()[0];
  const records: ReceivableRecord[] = ["EUR", "RMB"].flatMap((currency) =>
    Array.from({ length: 12 }, (_, i) => ({
      ...template,
      id: `${currency}:${i}`,
      customer: `Test ${i}`,
      amount: i + 1,
      currency: currency as "EUR" | "RMB",
      entityId: currency === "EUR" ? "dhk" : "ddc",
    })),
  );
  const top = getReceivables(state(records), admin, {
    ...defaultReceivablesFilters,
    customerGroup: "top10",
  });
  const other = getReceivables(state(records), admin, {
    ...defaultReceivablesFilters,
    customerGroup: "other",
  });
  assert.equal(top.rows.length, 20);
  assert.equal(other.rows.length, 4);
  assert.ok(other.rows.every((r) => !top.rows.some((t) => t.id === r.id)));
});
