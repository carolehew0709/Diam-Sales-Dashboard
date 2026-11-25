import assert from "node:assert/strict";
import test from "node:test";
import {
  opsSelectedOrders,
  salesOperationsOrder,
  salesOperationsView,
} from "../lib/sales-operations";
import type {
  OpsOrderLine,
  SalesOperationsSnapshot,
} from "../lib/sales-operations-types";

const line: OpsOrderLine = {
  order: "order-1",
  line: 1,
  date: "2026-10-02",
  customer: "Customer A",
  currency: "CNY",
  item: "Item",
  description: "",
  quantity: 3,
  ordered: 90,
  shipped: 60,
  open: 30,
  openQuantity: 1,
  team: "Team A",
  sourceRow: 5,
};
const snapshot: SalesOperationsSnapshot = {
  entityId: "ddc",
  from: "2026-10-01",
  asOf: "2026-11-25",
  sources: [],
  lines: [
    line,
    { ...line, line: 2, ordered: null, shipped: null, open: null, team: null },
    {
      ...line,
      order: "order-2",
      date: "2026-10-06",
      currency: "EUR",
      ordered: 20,
    },
  ],
  shipments: [
    {
      order: line.order,
      line: 1,
      document: "out-1",
      date: "2026-10-06",
      currency: "CNY",
      quantity: 1,
      amount: 30,
      sourceRow: 5,
    },
    {
      order: line.order,
      line: 1,
      document: "out-2",
      date: "2026-10-09",
      currency: "CNY",
      quantity: 1,
      amount: 30,
      sourceRow: 6,
    },
  ],
  receivables: [
    {
      document: "ar-1",
      date: "2026-10-09",
      due: "",
      currency: "CNY",
      amount: 60,
      settled: 10,
      balance: 50,
      status: "未核销",
      invoices: ["invoice-1"],
      sourceRow: 2,
    },
  ],
  receivableLinks: [
    { order: line.order, line: 1, document: "ar-1" },
    { order: line.order, line: 2, document: "ar-1" },
  ],
  payments: [
    {
      receipt: "receipt-1",
      receivable: "ar-1",
      receivableEntry: "ar-line-1",
      date: "2026-10-10",
      currency: "CNY",
      received: 8,
      settled: 10,
      sourceRow: 2,
    },
  ],
};

test("weekly shipments follow outbound dates while open balances follow the original order cohort", () => {
  const view = salesOperationsView(snapshot);
  const weeks = view.weekly.filter(({ currency }) => currency === "CNY");
  assert.deepEqual(
    weeks.map(({ week, orders, ordered, shipped, open }) => [
      week,
      orders,
      ordered,
      shipped,
      open,
    ]),
    [
      ["2026-09-28", 1, 90, null, 30],
      ["2026-10-05", 0, null, 60, null],
    ],
  );
  assert.equal(view.missingOrderAmounts, 1);
  assert.equal(
    view.currencies.find(({ currency }) => currency === "EUR")?.matchedCash,
    null,
  );
});

test("weekly register drills into shipments from other order weeks without adding their original order amounts", () => {
  const view = salesOperationsView(snapshot);
  const early = view.weekly.find((row) => row.week === "2026-09-28");
  assert.deepEqual(
    [early?.partial, early?.weekFrom, early?.weekTo],
    [true, "2026-10-01", "2026-10-04"],
  );
  const rows = opsSelectedOrders(view.orders, {
    dimension: "byWeek",
    week: "2026-10-05",
    currency: "CNY",
  });
  assert.deepEqual(
    rows.map(({ order, ordered, shipped, open }) => [
      order,
      ordered,
      shipped,
      open,
    ]),
    [["order-1", null, 60, null]],
  );
});

test("team selections use the approved aliases and only retain matching line amounts", () => {
  const mixed = {
    ...snapshot,
    lines: snapshot.lines.map((row, index) => ({
      ...row,
      team:
        index === 0
          ? "LVMH+Exclusive Team"
          : index === 1
            ? "Sephora Team"
            : "Panny Team",
    })),
  };
  const view = salesOperationsView(mixed);
  assert.deepEqual(
    new Set(view.teams.map(({ name }) => name)),
    new Set(["Panny Team-L", "Panny Team-S", "Panny Team"]),
  );
  assert.equal(view.splitTeamOrders, 1);
  const rows = opsSelectedOrders(view.orders, {
    dimension: "byTeam",
    name: "Panny Team-S",
    currency: "CNY",
  });
  assert.equal(rows[0].ordered, null);
  assert.equal(rows[0].lineCount, 1);
  const detail = salesOperationsOrder(mixed, line.order)!;
  assert.equal(detail.lines[0].team, "LVMH+Exclusive Team");
  assert.equal(detail.lines[0].reportingTeam, "Panny Team-L");
});

test("shared receivables and allocations appear once in the register with a whole-document scope", () => {
  const shared = {
    ...snapshot,
    receivableLinks: [
      ...snapshot.receivableLinks,
      { order: "order-2", line: 1, document: "ar-1" },
    ],
  };
  const view = salesOperationsView(shared);
  assert.equal(view.receivableRegister.length, 1);
  assert.deepEqual(view.receivableRegister[0].orders, ["order-1", "order-2"]);
  assert.equal(view.receivableRegister[0].amount, 60);
  assert.equal(view.paymentRegister.length, 1);
  assert.deepEqual(view.paymentRegister[0].orders, ["order-1", "order-2"]);
  assert.equal(
    salesOperationsOrder(shared, line.order)?.receivables[0].linkedOrderCount,
    2,
  );
});

test("multiple line links do not duplicate receivable amounts or actual cash in the order drill-down", () => {
  const detail = salesOperationsOrder(snapshot, line.order)!;
  assert.equal(detail.links.length, 2);
  assert.equal(detail.receivables.length, 1);
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].received, 8);
  assert.equal(detail.payments[0].settled, 10);
  assert.equal(salesOperationsOrder(snapshot, "outside-scope"), null);
});
