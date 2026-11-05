import test from "node:test";
import assert from "node:assert/strict";
import { orderDimensionColumns } from "../lib/order-dimensions";
import { publishTeamReference, retainedTeamView } from "../lib/team-reporting";
import { emptySnapshot } from "../lib/workbook-parser";
import { utils } from "xlsx";
import type { Store, ImportBatch, OrderBookLine, User } from "../lib/types";
import { defaultFilters } from "../lib/dashboard";
test("finds team/brand before inserted Jan-Oct actuals and ignores the right delivery block", () => {
  const ws: any = {};
  for (let m = 0; m < 10; m++)
    ws[utils.encode_cell({ r: 22, c: 5 + m })] = {
      v: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"][
        m
      ],
    };
  assert.deepEqual(orderDimensionColumns(ws, 22, 14), {
    team: 3,
    product: 4,
    shifted: true,
  });
  const ddc: any = {};
  for (let m = 0; m < 10; m++)
    ddc[utils.encode_cell({ r: 23, c: 4 + m })] =
      ws[utils.encode_cell({ r: 22, c: 5 + m })];
  assert.deepEqual(orderDimensionColumns(ddc, 22, 13), {
    team: 2,
    product: 3,
    shifted: true,
  });
  assert.deepEqual(
    orderDimensionColumns(
      { N23: { v: "Jan" }, O23: { v: "Feb" } } as any,
      22,
      3,
    ),
    { team: 3, product: 4, shifted: false },
  );
});
function fixture() {
  const old = emptySnapshot("dhk", 2026, 43, 10, "old.xlsx", "W43"),
    next = emptySnapshot("dhk", 2026, 44, 10, "next.xlsx", "W44");
  const line = (week: number, value: number) =>
    ({
      id: "row" + week,
      entityId: "dhk",
      year: 2026,
      week,
      product: "Brand",
      customer: "Client",
      customerType: "External",
      salesTeam: "Team",
      total2026: value,
      total2027: 0,
      monthly2026: [...Array(10).fill(0), value, 0],
      monthly2027: Array(12).fill(0),
      sourceFile: week === 43 ? "old.xlsx" : "next.xlsx",
      sourceSheet: "W" + week,
      sourceRow: 24,
    }) as OrderBookLine;
  const state = {
    version: 2,
    revision: 1,
    users: [],
    snapshots: [old, next],
    lines: [line(43, 3), line(44, 4)],
    batches: [],
    audit: [],
    retainedTeamSource: {
      snapshots: [structuredClone(old)],
      lines: [line(43, 3)],
      retainedAt: "prior",
    },
  } as Store;
  const batch = {
    snapshots: [next],
    lines: [line(44, 4)],
    findings: [],
    entityIds: ["dhk"],
  } as unknown as ImportBatch;
  return { state, batch, old };
}
test("only an explicitly reviewed weekly batch advances its pinned scope; retries and later normal imports preserve it", () => {
  const { state, batch, old } = fixture();
  const before = JSON.stringify(state.retainedTeamSource);
  publishTeamReference(state, batch, "first");
  assert.equal(JSON.stringify(state.retainedTeamSource), before);
  batch.updateTeamReporting = true;
  publishTeamReference(state, batch, "reviewed");
  assert.deepEqual(
    state.retainedTeamSource!.snapshots.find((s) => s.week === 43),
    old,
  );
  assert.deepEqual(state.retainedTeamSource!.reviewedScopes, ["dhk:2026:44"]);
  assert.equal(
    state.retainedTeamSource!.lines.filter((l) => l.week === 44).length,
    1,
  );
  publishTeamReference(state, batch, "retry");
  assert.equal(
    state.retainedTeamSource!.lines.filter((l) => l.week === 44).length,
    1,
  );
  const actor = {
    id: "a",
    role: "superadmin",
    region: "APAC",
    permissions: {},
  } as User;
  const view = retainedTeamView(state, actor, defaultFilters)!;
  assert.deepEqual(view.source.weeks, [44]);
  assert.equal(view.source.reviewed, true);
  assert.equal(view.teams[0].value, 4);
  publishTeamReference(
    state,
    {
      ...batch,
      updateTeamReporting: false,
      snapshots: [{ ...batch.snapshots[0], week: 45 }],
    },
    "later",
  );
  assert.deepEqual(
    retainedTeamView(state, actor, defaultFilters)!.source.weeks,
    [44],
  );
});
