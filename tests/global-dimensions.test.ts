import test from "node:test";
import assert from "node:assert/strict";
import source from "../data/apac-dashboard.json";
import customerSource from "../data/customer-analysis.json";
import { defaultFilters, filtersFrom, getDashboardSnapshot } from "../lib/dashboard";
import { customerAnalysisView } from "../lib/customer-analysis";
import { customerMetrics } from "../lib/customer-metrics";
import { customerName, salesTeamState } from "../lib/sales-teams";
import { keyCustomerOrderbook } from "../lib/key-customers";
import { dashboardFilterKey, customerAnalysisQuery } from "../lib/dashboard-presentation";
import type { Store, User } from "../lib/types";

const admin: User = { id: "test", name: "Test", email: "test@example.com", role: "superadmin", region: "APAC", crossRegionView: false, permissions: {} };
const state: Store = { version: 2, revision: 1, users: [], snapshots: source.snapshots as Store["snapshots"], lines: source.lines as Store["lines"], batches: [], audit: [], customerAnalyses: customerSource.analyses as Store["customerAnalyses"] };

test("global customer canonicalizes explicit variants, intersects team OB and never allocates invoices/budgets", () => {
  const before = JSON.stringify(state);
  const all = getDashboardSnapshot(state, admin, defaultFilters);
  const coty = getDashboardSnapshot(state, admin, { ...defaultFilters, customer: "Coty" });
  const expected = keyCustomerOrderbook(all.commercial).find((row) => row.name === "Coty")!.value!;
  assert.ok(Math.abs(coty.totals.orderbook! - expected) < 1e-8);
  assert.ok(coty.commercial.every((row) => customerName(row.customer) === "Coty"));
  assert.equal(coty.totals.sales, null);
  assert.equal(coty.totals.budget, null);
  assert.equal(coty.totals.coverage, null);
  assert.equal(coty.totals.prospect, null);
  const team = coty.graphics.teams.find((row) => row.name !== "__unassigned__")!;
  const both = getDashboardSnapshot(state, admin, { ...defaultFilters, customer: "Coty", salesTeam: team.name });
  assert.ok(Math.abs(both.totals.orderbook! - team.value) < 1e-8);
  assert.ok(both.graphics.teams.every((row) => row.name === team.name));
  assert.ok(all.customers.includes("Coty"));
  assert.ok(!all.customers.includes("COTY"));
  assert.equal(JSON.stringify(state), before);
});

test("customer facets honor permission scope and invalid customer selections cannot expose another region", () => {
  const india: User = { ...admin, role: "viewer", region: "India", permissions: { ddi: ["view"] } };
  const own = getDashboardSnapshot(state, india, { ...defaultFilters, region: "India" });
  const ownNames = new Set(state.lines.filter((line) => line.entityId === "ddi").map((line) => customerName(line.customer)));
  assert.ok(own.customers.every((name) => ownNames.has(name)));
  const selected = getDashboardSnapshot(state, india, { ...defaultFilters, customer: "Sephora" });
  assert.deepEqual(selected.customers, []);
  assert.deepEqual(selected.rows, []);
  assert.deepEqual(selected.commercial, []);
  assert.equal(customerAnalysisView(state, india, { ...defaultFilters, customer: "Coty" }).referenceTotal, null);
});

test("monthly customer selection retains only selected client rows and explicit China reference denominator", () => {
  const view = customerAnalysisView(state, admin, { ...defaultFilters, customer: "Coty" });
  assert.ok(view.analysis);
  assert.deepEqual(view.analysis.customers.map((row) => row.name), ["Coty"]);
  assert.deepEqual(view.analysis.breakdown, []);
  assert.equal(view.referenceTotal, 29182);
  assert.equal(customerMetrics(view.analysis, view.referenceTotal).keyTotal, view.analysis.customers[0].current);
  assert.equal(customerAnalysisView(state, admin, { ...defaultFilters, customer: "No matching customer" }).analysis, null);
  assert.equal(customerAnalysisView(state, admin, { ...defaultFilters, customer: "Coty", salesTeam: "Coty Team" }).analysis, null);
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
  const projected = salesTeamState(copy, "all", "Coty");
  const snapshot = projected.snapshots.find((row) => row.entityId === line.entityId && row.week === line.week)!;
  assert.equal(snapshot.monthlyOrderbook[line.customerType.toLowerCase() as "external" | "group"][9], null);
});
