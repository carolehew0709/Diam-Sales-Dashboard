import assert from "node:assert/strict";
import test from "node:test";
import { defaultReceivablesFilters, getReceivables } from "../lib/receivables";
import { getReceivablesTrends } from "../lib/receivables-trends";
import type { ReceivableRecord } from "../lib/receivables-types";
import type { ImportBatch, Store, User } from "../lib/types";

const admin = {
  id: "admin",
  role: "superadmin",
  region: "APAC",
  permissions: {},
} as User;
const row = (
  id: string,
  patch: Partial<ReceivableRecord> = {},
): ReceivableRecord => ({
  id,
  entityId: "ddc",
  category: "invoice",
  customer: "DEHK LIMITED",
  customerGroup: "Internal",
  subCustomer: "",
  salesTeam: "Internal Team",
  pic: "",
  invoiceNumber: id,
  invoiceDate: "2026-10-01",
  receivedDate: null,
  dueDate: "2026-10-10",
  asOfDate: "2026-10-31",
  terms: 9,
  overdueDays: 21,
  aging: "1-30",
  sourceAging: "1-30",
  customerType: "Group",
  amount: 1000,
  currency: "EUR",
  note: "",
  sourceFile: "Synthetic.xlsx",
  sourceSheet: "Invoices",
  sourceRow: 3,
  ...patch,
});
const store = (receivables: ReceivableRecord[]): Store => ({
  version: 2,
  revision: 1,
  users: [],
  audit: [],
  batches: [],
  snapshots: [],
  lines: [],
  receivables,
});

test("DDC intercompany reporting removes only identified DEHK invoices, across currencies and filters", () => {
  const state = store([
    row("internal-eur"),
    row("alias", { customer: "  dehk  ", currency: "RMB" }),
    row("spaces", { customer: " Dehk   Limited ", currency: "USD" }),
    row("credit", { amount: -80 }),
    row("source-name", {
      customer: "Displayed name",
      sourceCustomer: "DEHK LIMITED",
    }),
    row("external-eur", {
      customer: "External A",
      customerGroup: "Portfolio",
      salesTeam: "Team A",
      amount: 40,
      customerType: "External",
    }),
    row("external-rmb", {
      customer: "External B",
      customerGroup: "DEHK",
      salesTeam: "Team B",
      amount: 60,
      currency: "RMB",
      customerType: "External",
    }),
    row("dehk-own", {
      entityId: "dhk",
      customerGroup: "HK portfolio",
      salesTeam: "Team HK",
      amount: 70,
    }),
    row("shared-receipt", {
      entityId: "china-payments",
      category: "advance",
      asOfDate: null,
      receivedDate: "2026-11-09",
      amount: 25,
      salesTeam: "",
      customerGroup: undefined,
    }),
  ]);
  const before = JSON.stringify(state);
  const filters = { ...defaultReceivablesFilters, bu: "DDC" };
  const ddc = getReceivables(state, admin, filters);
  assert.deepEqual(
    ddc.rows.map((r) => r.id),
    ["external-eur", "external-rmb"],
  );
  assert.equal(ddc.totals.find((r) => r.currency === "EUR")!.ar, 40);
  assert.equal(ddc.totals.find((r) => r.currency === "RMB")!.ar, 60);
  assert.deepEqual(
    ddc.chart.map((c) => c.overdueProportion),
    [1, 1],
  );
  assert.deepEqual(
    ddc.customers.filter((c) => c !== "DEHK LIMITED"),
    ["External A", "External B"],
  );
  assert.ok(!ddc.sourceCustomerGroups.includes("Internal"));
  assert.ok(!ddc.salesTeams.includes("Internal Team"));
  assert.equal(ddc.payments[0].amount, 25);
  assert.equal(
    ddc.payments[0].customerType,
    "Group",
    "receipt classification keeps original evidence",
  );
  for (const patch of [
    { customer: "DEHK LIMITED" },
    { sourceCustomerGroup: "Internal" },
    { salesTeam: "Internal Team" },
  ])
    assert.deepEqual(
      getReceivables(state, admin, { ...filters, ...patch }).rows,
      [],
    );
  const all = getReceivables(state, admin, defaultReceivablesFilters);
  assert.equal(all.totals.find((r) => r.currency === "EUR")!.ar, 110);
  assert.deepEqual(all.payments, ddc.payments);
  const hk = getReceivables(state, admin, { ...filters, bu: "DEHK" });
  assert.deepEqual(
    hk.rows.map((r) => r.id),
    ["dehk-own"],
  );
  const onlyDDC = {
    ...admin,
    role: "viewer",
    permissions: { ddc: ["view"] },
  } as User;
  assert.deepEqual(getReceivables(state, onlyDDC, filters).payments, []);
  assert.equal(
    JSON.stringify(state),
    before,
    "published sources and history stay untouched",
  );
});

test("monthly AR history applies the same DDC exclusion to active and older snapshots", () => {
  const current = [
    row("internal-current", {
      customer: "Displayed name",
      sourceCustomer: "DEHK LIMITED",
      customerGroup: "Internal current",
    }),
    row("current-external", {
      customer: "External",
      customerGroup: "Public",
      amount: 30,
    }),
    row("current-hk", {
      entityId: "dhk",
      customerGroup: "HK portfolio",
      amount: 90,
    }),
  ];
  const historical = [
    row("internal-history", {
      asOfDate: "2026-09-30",
      customerGroup: "Internal history",
    }),
    row("public-history", {
      customer: "External",
      asOfDate: "2026-09-30",
      customerGroup: "Public",
      amount: 20,
    }),
  ];
  const state = store(current);
  state.batches = [
    {
      id: "published",
      status: "published",
      revision: 1,
      submittedBy: "admin",
      submittedAt: "2026-10-01",
      fileName: "Synthetic.xlsx",
      sourceType: "Excel",
      receivablesKind: "aging",
      entityIds: ["ddc"],
      receivables: historical,
      snapshots: [],
      lines: [],
      sheets: [],
      findings: [],
    } as ImportBatch,
  ];
  const before = JSON.stringify(state);
  const trend = getReceivablesTrends(state, admin, "2026-11-19");
  const ddc = trend.panels.find((p) => p.entityId === "ddc")!;
  assert.deepEqual(ddc.top, ["Public"]);
  assert.deepEqual(
    ddc.series.map((s) => s.name),
    ["Public"],
  );
  assert.deepEqual(ddc.series[0].values.slice(8), [20, 30, null]);
  assert.equal(
    trend.panels.find((p) => p.entityId === "dhk")!.series[0].values[9],
    90,
  );
  assert.equal(JSON.stringify(state), before);
});
