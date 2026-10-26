import test from "node:test";
import assert from "node:assert/strict";
import source from "../data/apac-dashboard.json";
import { defaultFilters, getDashboardSnapshot } from "../lib/dashboard";
import { exploreBusinessUnitRows } from "../lib/sales-graphics";
import type { Store, User } from "../lib/types";

const admin: User = { id: "test", name: "Test", email: "test@example.com", role: "superadmin", region: "APAC", crossRegionView: false, permissions: {} };
const state: Store = { version: 2, revision: 1, users: [], snapshots: source.snapshots as Store["snapshots"], lines: source.lines as Store["lines"], batches: [], audit: [] };

test("Explore shows the other authorized regional BUs while the primary view keeps the selected BU", () => {
  const data = getDashboardSnapshot(state, admin, { ...defaultFilters, bu: "DCP" });
  const before = JSON.stringify(data);
  const rows = exploreBusinessUnitRows(data.regionRows, data.filters);
  assert.deepEqual(rows.map((row) => row.entity.code).sort(), ["DDC", "DEHK"]);
  assert.deepEqual(data.rows.map((row) => row.entity.code), ["DCP"]);
  for (const row of rows) {
    assert.equal(row, data.regionRows.find((r) => r.entity.id === row.entity.id));
    const selected = getDashboardSnapshot(state, admin, { ...data.filters, bu: row.entity.businessUnit });
    assert.deepEqual(row.metrics, selected.rows[0].metrics);
  }
  assert.equal(JSON.stringify(data), before);
});

test("Explore preserves year, scenario, type, team and External customer projection", () => {
  for (const patch of [{ year: 2027 }, { scenario: "Sales" as const }, { salesType: "external" as const }, { salesTeam: "French Group", customer: "Chanel" }]) {
    const filters = { ...defaultFilters, bu: "DCP", ...patch };
    const data = getDashboardSnapshot(state, admin, filters);
    for (const row of exploreBusinessUnitRows(data.regionRows, filters)) {
      const direct = getDashboardSnapshot(state, admin, { ...filters, bu: row.entity.businessUnit });
      assert.deepEqual(row.metrics, direct.rows[0].metrics);
    }
  }
});

test("single-BU regions and single-BU permissions hide Explore without exposing other countries", () => {
  for (const region of ["India", "Japan", "Singapore"]) {
    const data = getDashboardSnapshot(state, admin, { ...defaultFilters, region });
    assert.deepEqual(exploreBusinessUnitRows(data.regionRows, data.filters), []);
  }
  const viewer: User = { ...admin, role: "viewer", permissions: { dcp: ["view"] } };
  const data = getDashboardSnapshot(state, viewer, { ...defaultFilters, bu: "DCP" });
  assert.deepEqual(exploreBusinessUnitRows(data.regionRows, data.filters), []);
});

test("All BUs decomposes the aggregate; explicit entity and legacy DEHK alias exclude that BU", () => {
  const data = getDashboardSnapshot(state, admin, defaultFilters);
  assert.equal(exploreBusinessUnitRows(data.regionRows, defaultFilters).length, 3);
  assert.deepEqual(exploreBusinessUnitRows(data.regionRows, { bu: "all", entity: "dcp" }).map((row) => row.entity.code).sort(), ["DDC", "DEHK"]);
  assert.deepEqual(exploreBusinessUnitRows(data.regionRows, { bu: "DHK", entity: "all" }).map((row) => row.entity.code).sort(), ["DCP", "DDC"]);
});
