import type { Amount, OrderBookLine, Snapshot, Store } from "./types";

const normalize = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const dhkNames = new Set(["DHK", "DEHK", "DEHKHK", "DEHONGKONG"]);
const ddcNames = new Set(["DDC", "DIAMCHINA"]);

// Owner-approved reporting exclusions, 2026-09-30. Do not remove all Group sales.
export function isDuplicateIntercompanyOrder(line: OrderBookLine) {
  if (line.customerType !== "Group") return false;
  const customer = normalize(line.customer);
  return (
    (line.entityId === "ddc" && dhkNames.has(customer)) ||
    (line.entityId === "dcp" &&
      (dhkNames.has(customer) || ddcNames.has(customer)))
  );
}

const subtract = (value: Amount, deduction: Amount): Amount => {
  if (value === null || deduction === null) return null;
  const result = value - deduction;
  return Math.abs(result) < 1e-9 ? 0 : result;
};
const sum = (values: Amount[]): Amount =>
  values.some((v) => v === null)
    ? null
    : values.reduce<number>((a, v) => a + v!, 0);
const key = (value: { entityId: string; year: number; week: number }) =>
  `${value.entityId}:${value.year}:${value.week}`;

/** Pure reporting projection. Raw workbooks, stored snapshots and imports remain intact.
 * Removing excluded lines makes repeated projection idempotent.
 */
export function reportingState(state: Store) {
  const excluded = state.lines.filter(isDuplicateIntercompanyOrder);
  const byWeek = new Map<string, OrderBookLine[]>();
  for (const line of excluded)
    byWeek.set(key(line), [...(byWeek.get(key(line)) ?? []), line]);
  const snapshots = state.snapshots.map((s): Snapshot => {
    const lines = byWeek.get(key(s));
    if (!lines?.length) return s;
    const current = sum(lines.map((l) => l.total2026));
    const next = sum(lines.map((l) => l.total2027));
    const monthly = Array.from({ length: 12 }, (_, i) =>
      sum(lines.map((l) => l.monthly2026[i])),
    );
    const nextMonthly = Array.from({ length: 12 }, (_, i) =>
      sum(lines.map((l) => l.monthly2027[i])),
    );
    return {
      ...s,
      orderbook: {
        ...s.orderbook,
        group: subtract(s.orderbook.group, current),
      },
      nextOrderbook: {
        ...s.nextOrderbook,
        group: subtract(s.nextOrderbook.group, next),
      },
      monthlyOrderbook: {
        ...s.monthlyOrderbook,
        group: s.monthlyOrderbook.group.map((v, i) => subtract(v, monthly[i])),
      },
      nextMonthlyOrderbook: {
        ...s.nextMonthlyOrderbook,
        group: s.nextMonthlyOrderbook.group.map((v, i) =>
          subtract(v, nextMonthly[i]),
        ),
      },
      // Monthly estimate includes MTD invoices + remaining orders. Deduct only this month's order allocation.
      monthEstimate: {
        ...s.monthEstimate,
        group: subtract(s.monthEstimate.group, monthly[s.month - 1]),
      },
      sourceCells: {
        ...s.sourceCells,
        intercompany: lines
          .map(
            (l) =>
              `${l.sourceSheet} row ${l.sourceRow} · ${l.customer} · 2026 ${l.total2026} / 2027 ${l.total2027} kEUR`,
          )
          .join("; "),
      },
      findings: [
        ...new Set([
          ...s.findings,
          "Intercompany orderbook excluded; invoiced sales unchanged",
        ]),
      ],
    };
  });
  return {
    ...state,
    snapshots,
    lines: state.lines.filter((l) => !isDuplicateIntercompanyOrder(l)),
    intercompanyExcluded: excluded,
  };
}
