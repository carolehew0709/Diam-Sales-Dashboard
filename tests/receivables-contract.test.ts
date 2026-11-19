// Synthetic parser contracts only. Private customer sources never enter GitHub/CI.
import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseReceivablesWorkbook } from "../lib/receivables-parser";
import { getReceivables, defaultReceivablesFilters } from "../lib/receivables";
import { getReceivablesTrends } from "../lib/receivables-trends";
import type { ImportBatch, Store, User } from "../lib/types";
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
      [
        "Date",
        "InvoiceNumber",
        "Customer",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "Divers in EUR",
        null,
        null,
        "Terms",
        "Overdue",
        "Aging",
      ],
      invoice(100, "EUR", "Not Due", "Test A"),
      invoice(200, "EUR", "1-30days", "Test B"),
      [null, null, "TOTAL", null, null, null, null, null, null, null, 99999],
    ],
    "DDC OVERDUE": [
      [...Array(14).fill(null), 46295],
      [
        "Date",
        "InvoiceNumber",
        "Customer",
        null,
        null,
        null,
        null,
        null,
        null,
        "Amount(CNY)",
        null,
        null,
        null,
        "Terms",
        "Overdue",
        "Aging",
      ],
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
  const fixture = state();
  for (const row of fixture.receivables!.filter(
    (r) => r.category === "invoice",
  ))
    row.customerGroup = "Test portfolio";
  const all = getReceivables(fixture, admin, {
    ...defaultReceivablesFilters,
    customerGroup: "top10",
  });
  const subset = getReceivables(fixture, admin, {
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
      customerGroup: `Portfolio ${i}`,
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
  const combined = getReceivables(
    state(records),
    admin,
    defaultReceivablesFilters,
  );
  for (const currency of ["EUR", "RMB"]) {
    const ranked = combined.ranking.filter((row) => row.currency === currency);
    assert.equal(ranked.length, 11);
    assert.equal(ranked[0].customerGroup, "Portfolio 11");
    assert.equal(ranked[9].customerGroup, "Portfolio 2");
    assert.equal(ranked[10].customerGroup, null);
    assert.equal(ranked[10].amount, 3);
  }
  const selected = getReceivables(state(records), admin, {
    ...defaultReceivablesFilters,
    customerGroup: "other",
    sourceCustomerGroup: "Portfolio 0",
  });
  assert.equal(selected.rows.length, 2);
});

test("DDC's DEHK invoices are excluded from totals, currency shares and ranking", () => {
  const base = parsed()[0];
  const invoices: ReceivableRecord[] = [
    {
      ...base,
      id: "dehk",
      entityId: "ddc",
      customer: "DEHK LIMITED",
      customerGroup: "DEHK",
      amount: 900,
      aging: "not-due",
    },
    {
      ...base,
      id: "a",
      entityId: "ddc",
      customer: "Company A",
      customerGroup: "Parent",
      amount: 80,
      aging: "not-due",
    },
    {
      ...base,
      id: "b",
      entityId: "ddc",
      customer: "Company B",
      customerGroup: "Parent",
      amount: 20,
      aging: "1-30",
    },
    {
      ...base,
      id: "c",
      entityId: "ddc",
      customer: "Company C",
      customerGroup: "Parent",
      amount: 20,
      currency: "RMB",
      aging: "1-30",
    },
    {
      ...base,
      id: "credit",
      entityId: "ddc",
      customer: "Unmapped",
      amount: -20,
      currency: "RMB",
      aging: "not-due",
    },
    {
      ...base,
      id: "d",
      entityId: "dhk",
      customer: "DEHK LIMITED",
      customerGroup: "DEHK",
      amount: 10,
      aging: "not-due",
    },
  ];
  const fixture = state(invoices);
  const all = getReceivables(fixture, admin, defaultReceivablesFilters);
  assert.equal(all.ranking.find((r) => r.customerGroup === "DEHK")?.amount, 10);
  const filters = {
    ...defaultReceivablesFilters,
    bu: "DDC",
    salesType: "external" as const,
  };
  const ddc = getReceivables(fixture, admin, filters);
  assert.deepEqual(ddc.ranking, [
    {
      customerGroup: "Parent",
      currency: "EUR",
      amount: 100,
      overdue: 20,
      overdueProportion: 0.2,
    },
    {
      customerGroup: "Parent",
      currency: "RMB",
      amount: 20,
      overdue: 20,
      overdueProportion: 1,
    },
  ]);
  assert.equal(ddc.totals.find((r) => r.currency === "EUR")?.ar, 100);
  assert.equal(ddc.chart[0].overdueProportion, 0.2);
  assert.equal(
    ddc.chart[0].buckets.find((b) => b.bucket === "not-due")?.proportion,
    0.8,
  );
  assert.equal(ddc.chart[1].overdueProportion, null);
  assert.ok(!ddc.rows.some((r) => r.id === "dehk"));
  assert.ok(!ddc.customers.includes("DEHK LIMITED"));
  assert.ok(!ddc.sourceCustomerGroups.includes("DEHK"));
  assert.equal(fixture.receivables!.find((r) => r.id === "dehk")!.amount, 900);
  const top = getReceivables(fixture, admin, {
    ...filters,
    customerGroup: "top10",
  });
  assert.deepEqual(
    top.rows.map((row) => row.id),
    ["a", "b", "c"],
  );
});

test("AR uses Sales Team2 labels and filters source Customer Group within permitted invoices", () => {
  const fixture = state();
  fixture.teamActualData = {
    year: 2026,
    month: 10,
    currency: "EUR",
    unit: "kEUR",
    sourceFile: "Team allocations.xlsx",
    sourceSheet: "Sheet1",
    mappings: { "Sephora Team": "Panny Team", "French Group": "Lynn Team" },
    rows: [],
  };
  const invoices = fixture.receivables!.filter((r) => r.category === "invoice");
  Object.assign(invoices[0], {
    salesTeam: "Panny Team-S",
    customerGroup: "Portfolio A",
  });
  Object.assign(invoices[1], {
    salesTeam: "Sephora Team",
    customerGroup: "Portfolio A",
  });
  Object.assign(invoices[2], {
    salesTeam: "Lynn-Team",
    customerGroup: "Portfolio B",
  });
  const view = getReceivables(fixture, admin, {
    ...defaultReceivablesFilters,
    salesTeam: "Panny Team",
    sourceCustomerGroup: "Portfolio A",
  });
  assert.deepEqual(
    view.rows.map((r) => [r.salesTeam, r.sourceSalesTeam]),
    [
      ["Panny Team", "Panny Team-S"],
      ["Panny Team", "Sephora Team"],
    ],
  );
  assert.deepEqual(view.sourceCustomerGroups, ["Portfolio A", "Portfolio B"]);
  assert.equal(invoices[0].salesTeam, "Panny Team-S");
  const authorized = getReceivables(
    fixture,
    { ...india, permissions: { dhk: ["view"] } },
    defaultReceivablesFilters,
  );
  assert.deepEqual(authorized.sourceCustomerGroups, ["Portfolio A"]);
  assert.deepEqual(authorized.payments, []);
  const unfiltered = getReceivables(fixture, admin, defaultReceivablesFilters);
  const groupOnly = getReceivables(fixture, admin, {
    ...defaultReceivablesFilters,
    sourceCustomerGroup: "Portfolio A",
  });
  assert.deepEqual(groupOnly.payments, unfiltered.payments);
  assert.ok(unfiltered.salesTeams.includes("Lynn Team"));
});

test("TBC in the team column is unassigned and keeps its pending receipt balance", () => {
  const fixture = state();
  const receipt = fixture.receivables!.find((r) => r.category === "unknown")!;
  receipt.category = "pending";
  receipt.salesTeam = " Tbc ";

  const view = getReceivables(fixture, admin, defaultReceivablesFilters);
  assert.ok(!view.salesTeams.some((name) => name.toLowerCase() === "tbc"));
  assert.ok(view.salesTeams.includes("__unassigned__"));
  const unassigned = getReceivables(fixture, admin, {
    ...defaultReceivablesFilters,
    salesTeam: "__unassigned__",
  });
  const visible = unassigned.payments.find((r) => r.id === receipt.id);
  assert.equal(visible?.category, "pending");
  assert.equal(visible?.amount, receipt.amount);
  assert.equal(visible?.sourceSalesTeam, " Tbc ");
});

test("AR trend uses trusted monthly snapshot revisions, preserves gaps and scopes histories", () => {
  const base = parsed()[0];
  const invoice = (
    id: string,
    entityId: string,
    asOfDate: string,
    amount: number,
    customerGroup?: string,
  ): ReceivableRecord => ({
    ...base,
    id,
    entityId,
    customerGroup,
    asOfDate,
    amount,
  });
  const fixture = state([
    invoice("active-a", "dhk", "2026-04-30", 20, "Portfolio A"),
    invoice("active-b", "dhk", "2026-04-30", 40, "Portfolio B"),
    invoice("active-ddc", "ddc", "2026-04-30", 700, "DDC group"),
  ]);
  const batch = (
    revision: number,
    records: ReceivableRecord[],
  ): ImportBatch => ({
    id: String(revision),
    submittedBy: "test",
    submittedAt: "2026-04-30",
    fileName: "Synthetic",
    sourceType: "Excel",
    status: "published",
    revision,
    receivablesKind: "aging",
    receivables: records,
    entityIds: ["dhk", "ddc"],
    snapshots: [],
    lines: [],
    sheets: [],
    findings: [],
  });
  const ignored = batch(5, []);
  ignored.publication = {
    scopes: ["ar:aging:dhk"],
    reason: "restored",
    reviewVersion: "test",
    restoredAt: "2026-05-01",
    before: { snapshots: [], lines: [], customerAnalyses: [], receivables: [] },
    after: {
      snapshots: [],
      lines: [],
      customerAnalyses: [],
      receivables: [
        invoice("restored", "dhk", "2026-02-28", 888, "Portfolio A"),
      ],
    },
  };
  fixture.batches = [
    batch(4, [invoice("published-a", "dhk", "2026-04-30", 500, "Portfolio A")]),
    batch(2, [invoice("revised-a", "dhk", "2026-01-31", 5, "Portfolio A")]),
    batch(1, [invoice("older-a", "dhk", "2026-01-31", 100, "Portfolio A")]),
    batch(3, [invoice("unmapped", "dhk", "2026-03-31", 99)]),
    ignored,
  ];
  const result = getReceivablesTrends(fixture, admin, "2026-05-11");
  assert.deepEqual(result.months, [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
  ]);
  const hk = result.panels.find((p) => p.entityId === "dhk")!;
  assert.deepEqual(hk.top, ["Portfolio B", "Portfolio A"]);
  assert.equal(hk.observedMonths, 2);
  assert.deepEqual(hk.series[0].values, [5, null, null, 20, null]);
  const single = getReceivablesTrends(
    fixture,
    { ...india, permissions: { dhk: ["view"] } },
    "2026-05-11",
  );
  assert.deepEqual(single.panels, [hk]);
  assert.deepEqual(
    getReceivablesTrends(fixture, india, "2026-05-11").panels,
    [],
  );
});
