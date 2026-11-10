// Public tests use synthetic receipts only, never actual payer or customer details.
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parsePaymentStatusWorkbook } from "../lib/payment-status-parser";
import { identifyWorkbook } from "../lib/workbook-intake";
import {
  defaultReceivablesFilters,
  getReceivables,
  summarizeReceipts,
} from "../lib/receivables";
import {
  importActor,
  previewImport,
  previewRestore,
  publishReviewed,
  restoreReviewed,
} from "../lib/import-review";
import type { ImportBatch, Store, User } from "../lib/types";
import type { ReceivableRecord } from "../lib/receivables-types";

function fixture(extraSheets = true) {
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "#",
      "Year",
      "Received Date\n(YYYY-MM-DD)",
      "Payer",
      "Currency",
      "Received\nAmount",
      "Balance",
      "Bank\nSlip",
      "Remarks",
      "Sale Team",
      "PIC",
      "Status",
      "Customer",
    ],
    [
      1,
      2026,
      "2026-11-09",
      "Payer A",
      "USD",
      1000,
      100,
      "Y",
      "Unapplied",
      "Team A",
      "PIC A",
      "Unknown",
      "Customer A",
    ],
    [
      2,
      2026,
      "2026-10-01",
      "Payer B",
      "EUR",
      500,
      -5.5,
      "N",
      "Credit retained",
      "Team B",
      "PIC B",
      "Advance",
      "Customer B",
    ],
    [
      3,
      2026,
      "2026-11-05",
      "Payer C",
      "USD",
      25,
      25,
      "Y",
      "Review classification",
      "Team A",
      "PIC C",
      "TBC",
      "Customer C",
    ],
    [],
  ]);
  ws.G5 = { t: "n", f: "SUM(G2:G4)", v: 119.5 };
  ws["!ref"] = "A1:M5";
  XLSX.utils.book_append_sheet(book, ws, "Unknown & Advance");
  if (extraSheets) {
    // Deliberately contradictory, unsupported auxiliary sheets must not become sources.
    for (const name of ["Summary2", "Summary", "Unknown", "Advance"])
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([["Not authoritative", 999999]]),
        name,
      );
  }
  return book;
}
const bytes = (book: XLSX.WorkBook) =>
  XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
const parse = (book = fixture()) =>
  parsePaymentStatusWorkbook(bytes(book), "Synthetic receipts.xlsx");
const failures = (book: XLSX.WorkBook) =>
  parse(book).findings.filter((f) => f.severity === "error");
const admin = {
  id: "admin",
  role: "superadmin",
  region: "APAC",
  permissions: {},
} as User;
const editor = {
  ...admin,
  id: "editor",
  role: "editor",
  permissions: { dhk: ["view", "edit"], ddc: ["view", "edit"] },
} as User;
const invoice = (
  id: string,
  entityId: string,
  currency: "EUR" | "RMB",
  amount: number,
): ReceivableRecord => ({
  ...parse().records[0],
  id,
  entityId,
  currency,
  amount,
  category: "invoice",
  invoiceDate: "2026-10-01",
  receivedDate: null,
  asOfDate: "2026-10-31",
  aging: "not-due",
});
const state = (): Store => ({
  version: 2,
  revision: 1,
  users: [admin, editor],
  snapshots: [],
  lines: [],
  audit: [],
  batches: [],
  receivables: [
    invoice("dehk", "dhk", "EUR", 500),
    invoice("ddc", "ddc", "RMB", 600),
    { ...parse().records[0], id: "old-receipt", currency: "EUR", amount: 123 },
  ],
});
const batch = (): ImportBatch => {
  const parsed = parse();
  return {
    id: "receipt-batch",
    fileName: "Synthetic receipts.xlsx",
    sourceType: "Excel",
    status: "review",
    submittedAt: "2026-11-10T00:00:00Z",
    submittedBy: editor.id,
    entityIds: ["dhk", "ddc"],
    snapshots: [],
    lines: [],
    sheets: parsed.sheets,
    findings: parsed.findings,
    receivables: parsed.records,
    receivablesKind: "payments",
    templateVersion: "payments-status-v2",
  };
};

test("combined sheet is authoritative for whole-workbook and single-sheet uploads; statuses, signed balances and native currencies stay intact", () => {
  for (const extra of [true, false]) {
    const book = fixture(extra),
      result = parse(book);
    assert.equal(identifyWorkbook(bytes(book)), "payments-status");
    assert.deepEqual(failures(book), []);
    assert.equal(result.sourceKind, "payments");
    assert.equal(result.replacementEntityIds, undefined);
    assert.deepEqual(
      result.records.map((r) => [r.category, r.currency, r.amount]),
      [
        ["unknown", "USD", 100],
        ["advance", "EUR", -5.5],
        ["pending", "USD", 25],
      ],
    );
    assert.equal(result.records[0].receivedAmount, 1000);
    assert.equal(result.records[0].amount, 100);
    assert.equal(result.records[0].customer, "Customer A");
    assert.equal(result.records[0].salesTeam, "Team A");
    assert.equal(result.records[0].pic, "PIC A");
    assert.equal(result.records[2].sourceStatus, "TBC");
    assert.equal(result.records[2].sourceRow, 4);
    assert.ok(
      result.findings.some(
        (f) => f.severity === "review" && f.code === "receipts.pendingReview",
      ),
    );
  }
});

test("invalid headers, currencies, statuses, date/cache errors and stale controls block publication", () => {
  for (const mutate of [
    (w: XLSX.WorkSheet) => {
      w.G1.v = "Converted EUR";
    },
    (w: XLSX.WorkSheet) => {
      w.G2 = { t: "n", f: "1+99" };
    },
    (w: XLSX.WorkSheet) => {
      w.G2 = { t: "e", v: 15 };
    },
    (w: XLSX.WorkSheet) => {
      w.G2 = { t: "s", v: "100" };
    },
    (w: XLSX.WorkSheet) => {
      w.E2.v = "GBP";
    },
    (w: XLSX.WorkSheet) => {
      w.L2.v = "constructor";
    },
    (w: XLSX.WorkSheet) => {
      w.L2.v = "";
    },
    (w: XLSX.WorkSheet) => {
      w.C2.v = "2026-02-30";
    },
    (w: XLSX.WorkSheet) => {
      w.D2.v = "";
    },
    (w: XLSX.WorkSheet) => {
      w.G5.v = 120;
    },
  ]) {
    const book = fixture();
    mutate(book.Sheets["Unknown & Advance"]);
    assert.ok(failures(book).length);
  }
});

test("zero balances and genuinely repeated receipt lines remain distinct; unknown values never become zero", () => {
  const book = fixture(false),
    ws = book.Sheets["Unknown & Advance"];
  for (const col of [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
  ])
    ws[`${col}4`] = { ...ws[`${col}2`] };
  ws.G3.v = 0;
  ws.G5.v = 200;
  assert.deepEqual(failures(book), []);
  const result = parse(book);
  assert.equal(result.records.length, 3);
  assert.equal(result.records[1].amount, 0);
  assert.notEqual(result.records[0].id, result.records[2].id);
  const mixed = fixture();
  XLSX.utils.book_append_sheet(mixed, XLSX.utils.aoa_to_sheet([[1]]), "W46");
  assert.throws(() => identifyWorkbook(bytes(mixed)), /mixed or unknown/);
  const duplicate = fixture();
  XLSX.utils.book_append_sheet(
    duplicate,
    duplicate.Sheets["Unknown & Advance"],
    "Unknown&Advance",
  );
  assert.ok(failures(duplicate).length);
});

test("native USD, EUR and pending receipts reconcile independently, never alter invoice AR or leak into partial/India scope", () => {
  const store = state();
  store.receivables = [
    ...store.receivables!.filter((r) => r.category === "invoice"),
    ...parse().records,
  ];
  const view = getReceivables(store, admin, defaultReceivablesFilters);
  const usd = view.totals.find((r) => r.currency === "USD")!;
  assert.equal(usd.unknown, 100);
  assert.equal(usd.pending, 25);
  assert.equal(usd.ar, null);
  assert.equal(view.totals.find((r) => r.currency === "EUR")!.advance, -5.5);
  assert.deepEqual(
    view.chart.map((r) => r.currency),
    ["EUR", "RMB"],
  );
  assert.deepEqual(
    summarizeReceipts(parse().records).map((r) => [
      r.currency,
      r.total.amount,
      r.total.count,
    ]),
    [
      ["EUR", -5.5, 1],
      ["USD", 125, 2],
    ],
  );
  for (const filter of [
    { bu: "DDC", aging: "over-120" },
    { bu: "DEHK", aging: "not-due" },
  ])
    assert.deepEqual(
      getReceivables(store, admin, {
        ...defaultReceivablesFilters,
        ...filter,
      } as typeof defaultReceivablesFilters).payments,
      view.payments,
    );
  assert.equal(
    getReceivables(store, admin, {
      ...defaultReceivablesFilters,
      salesTeam: "Team B",
    }).payments.length,
    1,
  );
  assert.equal(
    getReceivables(store, admin, {
      ...defaultReceivablesFilters,
      customer: "Customer C",
    }).payments[0].category,
    "pending",
  );
  for (const permissions of [{ dhk: ["view"] }, { ddi: ["view", "edit"] }] as User["permissions"][]) {
    const actor = { ...editor, permissions } as User,
      hidden = getReceivables(store, actor, defaultReceivablesFilters);
    assert.deepEqual(hidden.payments, []);
    assert.deepEqual(hidden.receiptSummary, []);
    assert.ok(hidden.totals.every((r) => r.currency !== "USD"));
  }
});

test("shared receipts require both edit scopes, admin publication and pending review; stale publication is rejected and restore is scoped", () => {
  const store = state(),
    incoming = batch();
  store.batches.push(incoming);
  importActor(store, editor, incoming);
  const partial = { ...editor, id: "partial", permissions: { dhk: ["view", "edit"] } } as User;
  store.users.push(partial);
  assert.throws(
    () =>
      importActor(
        store,
        partial,
        incoming,
      ),
    /scope|permission|access/i,
  );
  const preview = previewImport(store, incoming);
  assert.deepEqual(preview.selectedScopes, ["ar:payments"]);
  assert.equal(preview.options[0].after.arUSD, 125);
  assert.equal(preview.options[0].after.pendingReceipts, 1);
  const request = {
    selectedScopes: preview.selectedScopes,
    reviewVersion: preview.reviewVersion,
    reason: "Reviewed pending receipts and native currencies",
  };
  assert.throws(
    () => publishReviewed(store, incoming, editor, request),
    /permitted/i,
  );
  assert.throws(
    () => publishReviewed(store, incoming, admin, { ...request, reason: "" }),
    /confirmation/i,
  );
  const changed = structuredClone(store);
  changed.receivables!.find((r) => r.id === "old-receipt")!.amount = 124;
  assert.throws(
    () => publishReviewed(changed, changed.batches[0], admin, request),
    /Review has changed/,
  );
  const before = structuredClone(store.receivables);
  publishReviewed(store, incoming, admin, request);
  assert.deepEqual(
    store.receivables!.filter((r) => r.category === "invoice"),
    before!.filter((r) => r.category === "invoice"),
  );
  assert.equal(
    store.receivables!.filter((r) => r.category !== "invoice").length,
    3,
  );
  const count = store.receivables!.length;
  publishReviewed(store, incoming, admin, request);
  assert.equal(store.receivables!.length, count);
  const restore = previewRestore(store, incoming);
  restoreReviewed(
    store,
    incoming,
    admin,
    restore.reviewVersion,
    "Restore prior receipt publication",
  );
  const sorted = (rows: ReceivableRecord[]) =>
    rows.slice().sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sorted(store.receivables!), sorted(before!));
});
