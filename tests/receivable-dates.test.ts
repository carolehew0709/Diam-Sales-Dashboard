import test from "node:test";
import assert from "node:assert/strict";
import { getReceivables, defaultReceivablesFilters } from "../lib/receivables";
import type { ReceivableRecord } from "../lib/receivables-types";
import type { Store, User } from "../lib/types";

const admin = {
  id: "admin",
  role: "superadmin",
  region: "APAC",
  permissions: {},
} as User;
const row = (
  id: string,
  entityId: string,
  patch: Partial<ReceivableRecord> = {},
): ReceivableRecord => ({
  id,
  entityId,
  category: "invoice",
  customer: "Customer A",
  subCustomer: "",
  salesTeam: "Team A",
  pic: "",
  invoiceNumber: id,
  invoiceDate: "2026-10-01",
  receivedDate: null,
  dueDate: "2026-11-01",
  asOfDate: "2026-10-31",
  terms: 30,
  overdueDays: 0,
  aging: "not-due",
  sourceAging: "Not Due",
  customerType: "External",
  amount: 100,
  currency: "EUR",
  note: "",
  sourceFile: "Invoice October.xlsx",
  sourceSheet: "Invoices",
  sourceRow: 3,
  ...patch,
});
const state = (): Store => ({
  version: 2,
  revision: 24,
  snapshots: [],
  lines: [],
  users: [],
  audit: [],
  batches: [],
  receivables: [
    row("dhk", "dhk"),
    row("ddc", "ddc", {
      salesTeam: "Team B",
      currency: "RMB",
      customer: "Customer B",
    }),
    row("advance", "china-payments", {
      category: "advance",
      invoiceDate: null,
      invoiceNumber: "",
      asOfDate: null,
      receivedDate: "2026-10-23",
      currency: "USD",
      sourceFile: "Receipts 20991231.xlsx",
    }),
    row("pending", "china-payments", {
      category: "pending",
      invoiceDate: null,
      invoiceNumber: "",
      asOfDate: null,
      receivedDate: "2026-11-09",
      salesTeam: "Team C",
      customer: "Customer C",
    }),
    row("unknown", "china-payments", {
      category: "unknown",
      invoiceDate: null,
      invoiceNumber: "",
      asOfDate: null,
      receivedDate: "2026-11-05",
      salesTeam: "Team B",
      customer: "Customer B",
    }),
  ],
});

test("Entity aging cutoffs and latest receipt date retain distinct meanings without rewriting source records", () => {
  const source = state(),
    before = structuredClone(source);
  const view = getReceivables(source, admin, defaultReceivablesFilters);
  assert.deepEqual(view.asOfDates, ["2026-10-31"]);
  assert.deepEqual(view.invoiceSourceDates, [
    { entityId: "dhk", entityCode: "DEHK", dates: ["2026-10-31"] },
    { entityId: "ddc", entityCode: "DDC", dates: ["2026-10-31"] },
  ]);
  assert.equal(view.latestReceiptDate, "2026-11-09");
  assert.deepEqual(source, before);
});

test("Entity and aging filters retain independent shared receipt dates; customer and team follow visible receipts", () => {
  const source = state();
  const ddc = getReceivables(source, admin, {
    ...defaultReceivablesFilters,
    bu: "DDC",
    aging: "over-120",
  });
  assert.deepEqual(ddc.invoiceSourceDates, [
    { entityId: "ddc", entityCode: "DDC", dates: ["2026-10-31"] },
  ]);
  assert.equal(ddc.rows.length, 0);
  assert.equal(ddc.latestReceiptDate, "2026-11-09");
  assert.equal(
    getReceivables(source, admin, {
      ...defaultReceivablesFilters,
      customer: "Customer A",
    }).latestReceiptDate,
    "2026-10-23",
  );
  assert.equal(
    getReceivables(source, admin, {
      ...defaultReceivablesFilters,
      salesTeam: "Team B",
    }).latestReceiptDate,
    "2026-11-05",
  );
  assert.equal(
    getReceivables(source, admin, {
      ...defaultReceivablesFilters,
      customer: "Missing",
    }).latestReceiptDate,
    null,
  );
});

test("partial Entity and India accounts cannot read shared receipt freshness metadata", () => {
  const source = state();
  const one = getReceivables(
    source,
    { ...admin, role: "viewer", permissions: { dhk: ["view"] } } as User,
    defaultReceivablesFilters,
  );
  assert.equal(one.latestReceiptDate, null);
  assert.deepEqual(
    one.invoiceSourceDates.map((r) => r.entityCode),
    ["DEHK"],
  );
  const india = getReceivables(
    source,
    {
      ...admin,
      role: "editor",
      permissions: { ddi: ["view", "edit"] },
    } as User,
    defaultReceivablesFilters,
  );
  assert.equal(india.latestReceiptDate, null);
  assert.deepEqual(india.invoiceSourceDates, []);
});

test("multiple invoice source dates and missing receipt dates stay explicit; filenames are not date evidence", () => {
  const source = state();
  source.receivables!.push(row("older", "dhk", { asOfDate: "2026-09-30" }));
  source
    .receivables!.filter((r) => r.category !== "invoice")
    .forEach((r) => {
      r.receivedDate = null;
    });
  const view = getReceivables(source, admin, defaultReceivablesFilters);
  assert.deepEqual(view.invoiceSourceDates[0].dates, [
    "2026-09-30",
    "2026-10-31",
  ]);
  assert.equal(view.latestReceiptDate, null);
  assert.equal(
    getReceivables(
      { ...source, receivables: [] },
      admin,
      defaultReceivablesFilters,
    ).latestReceiptDate,
    null,
  );
});
