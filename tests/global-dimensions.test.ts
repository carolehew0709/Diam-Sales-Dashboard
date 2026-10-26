import test from "node:test";
import assert from "node:assert/strict";
import source from "../data/apac-dashboard.json";
import customerSource from "../data/customer-analysis.json";
import { defaultFilters, filtersFrom, getDashboardSnapshot } from "../lib/dashboard";
import { customerAnalysisView } from "../lib/customer-analysis";
import { customerMetrics } from "../lib/customer-metrics";
import { customerName, orderCustomerName, orderCustomerKey, salesTeamState } from "../lib/sales-teams";
import { reportingState } from "../lib/intercompany";
import { emptySnapshot } from "../lib/workbook-parser";
import { dashboardFilterKey, customerAnalysisQuery } from "../lib/dashboard-presentation";
import type { Store, User } from "../lib/types";

const admin: User = { id: "test", name: "Test", email: "test@example.com", role: "superadmin", region: "APAC", crossRegionView: false, permissions: {} };
const state: Store = { version: 2, revision: 1, users: [], snapshots: source.snapshots as Store["snapshots"], lines: source.lines as Store["lines"], batches: [], audit: [], customerAnalyses: customerSource.analyses as Store["customerAnalyses"] };

test("global customer canonicalizes explicit variants, intersects team OB and never allocates invoices/budgets", () => {
  const before = JSON.stringify(state);
  const all = getDashboardSnapshot(state, admin, defaultFilters);
  const label = all.customers.find((name) => name.includes("Chloe"))!;
  assert.ok(label);
  const coty = getDashboardSnapshot(state, admin, { ...defaultFilters, customer: label });
  const expected = reportingState(state, "all").lines.filter((line) => all.rows.some((row) => row.entity.id === line.entityId && row.snapshot?.week === line.week) && orderCustomerKey(orderCustomerName(line)) === orderCustomerKey(label)).reduce((sum, line) => sum + line.total2026, 0);
  assert.ok(Math.abs(coty.totals.orderbook! - expected) < 1e-8);
  assert.ok(coty.commercial.every((row) => customerName(row.customer) === "Coty"));
  assert.equal(coty.totals.sales, null);
  assert.equal(coty.totals.budget, null);
  assert.equal(coty.totals.coverage, null);
  assert.equal(coty.totals.prospect, null);
  const team = coty.graphics.teams.find((row) => row.name !== "__unassigned__")!;
  const both = getDashboardSnapshot(state, admin, { ...defaultFilters, customer: label, salesTeam: team.name });
  assert.ok(Math.abs(both.totals.orderbook! - team.value) < 1e-8);
  assert.ok(both.graphics.teams.every((row) => row.name === team.name));
  assert.ok(all.customers.includes(label));
  assert.ok(!all.customers.includes("ESTEE LAUDER(TR)"));
  assert.equal(JSON.stringify(state), before);
});

test("customer facets honor permission scope and invalid customer selections cannot expose another region", () => {
  const india: User = { ...admin, role: "viewer", region: "India", permissions: { ddi: ["view"] } };
  const own = getDashboardSnapshot(state, india, { ...defaultFilters, region: "India" });
  const ownNames = new Set(state.lines.filter((line) => line.entityId === "ddi").map((line) => orderCustomerKey(orderCustomerName(line))));
  assert.ok(own.customers.every((name) => ownNames.has(orderCustomerKey(name))));
  const selected = getDashboardSnapshot(state, india, { ...defaultFilters, customer: "Sephora" });
  assert.deepEqual(selected.customers, []);
  assert.deepEqual(selected.rows, []);
  assert.deepEqual(selected.commercial, []);
  assert.equal(customerAnalysisView(state, india, { ...defaultFilters, customer: "Coty" }).referenceTotal, null);
});

test("External-only customer selection does not substitute unsplit monthly customer totals", () => {
  const all = customerAnalysisView(state, admin, defaultFilters);
  assert.ok(all.analysis);
  assert.equal(all.analysis.customers.length, 6);
  assert.equal(customerMetrics(all.analysis, all.referenceTotal).keyTotal, 11923);
  for (const customer of ["SEPHORA", "Coty", "LVMH-Dior"]) {
    const view = customerAnalysisView(state, admin, { ...defaultFilters, customer });
    assert.equal(view.analysis, null);
    assert.equal(view.referenceTotal, null);
    assert.deepEqual(view.months, []);
  }
});

test("customer identity participates in stale-export cancellation and parsed/query filters", () => {
  const filters = { ...defaultFilters, customer: "Coty" };
  assert.notEqual(dashboardFilterKey(filters), dashboardFilterKey(defaultFilters));
  assert.notEqual(customerAnalysisQuery(filters, ""), customerAnalysisQuery(defaultFilters, ""));
  assert.equal(filtersFrom(new URL("https://example.com/api/dashboard?customer=Coty")).customer, "Coty");
  assert.equal(dashboardFilterKey({ ...defaultFilters, customer: undefined }), dashboardFilterKey(defaultFilters));
});

test("dimension projection keeps unknown delivery allocations missing", () => {
  const copy = structuredClone(state);
  const line = copy.lines.find((row) => customerName(row.customer) === "Coty")!;
  line.monthly2026[9] = null;
  const projected = salesTeamState(copy, "all", orderCustomerName(line));
  const snapshot = projected.snapshots.find((row) => row.entityId === line.entityId && row.week === line.week)!;
  assert.equal(snapshot.monthlyOrderbook[line.customerType.toLowerCase() as "external" | "group"][9], null);
});


test("Customer uses source E and keeps distinct combinations even with the same G bill-to", () => {
  const snapshot = emptySnapshot("dhk", 2026, 43, 10, "synthetic.xlsx", "W43");
  const line = { ...state.lines[0], entityId: "dhk", year: 2026, week: 43, customerType: "External" as const, customer: "Same bill-to", salesTeam: "Team A", monthly2026: Array(12).fill(0), monthly2027: Array(12).fill(0), total2027: 0 };
  const sample: Store = { ...state, snapshots: [snapshot], lines: [{ ...line, id: "a", product: "Combination A", total2026: 11 }, { ...line, id: "b", product: "Combination B", total2026: 22 }, { ...line, id: "c", product: "Combination A", customerType: "Group", total2026: 99 }, { ...line, id: "d", product: "Internal-only label", customerType: "Group", total2026: 88 }] };
  const all = getDashboardSnapshot(sample, admin, defaultFilters);
  assert.deepEqual(all.customers, ["Combination A", "Combination B"]);
  const selected = getDashboardSnapshot(sample, admin, { ...defaultFilters, customer: "Combination A" });
  assert.equal(selected.totals.orderbook, 11);
  assert.ok(salesTeamState(sample, "all", "Combination A").lines.every((line) => line.customerType === "External"));
  assert.deepEqual(getDashboardSnapshot(sample, admin, { ...defaultFilters, salesType: "group" }).customers, []);
  assert.equal(sample.lines[2].total2026, 99);
  assert.equal(selected.commercial[0].customer, "Same bill-to");
  assert.equal(customerAnalysisView(state, admin, { ...defaultFilters, customer: "LVMH-Dior" }).analysis, null);
});
