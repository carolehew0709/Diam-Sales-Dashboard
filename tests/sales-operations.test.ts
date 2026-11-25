import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("multiple line links do not duplicate receivable amounts or actual cash in the order drill-down", () => {
  const detail = salesOperationsOrder(snapshot, line.order)!;
  assert.equal(detail.links.length, 2);
  assert.equal(detail.receivables.length, 1);
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].received, 8);
  assert.equal(detail.payments[0].settled, 10);
  assert.equal(salesOperationsOrder(snapshot, "outside-scope"), null);
});
