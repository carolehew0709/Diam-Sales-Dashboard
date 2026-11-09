import type { OrderBookLine, Snapshot, Store } from "./types";
export function lineYear(line: OrderBookLine, year: number) {
  return (
    line.amountsByYear?.[year] ??
    (year === line.year
      ? { total: line.total2026, monthly: line.monthly2026 }
      : year === line.year + 1
        ? { total: line.total2027, monthly: line.monthly2027 }
        : { total: null, monthly: Array<null>(12).fill(null) })
  );
}
export function sourceYear(
  state: Pick<Store, "snapshots">,
  entityId: string,
  target: number,
) {
  return state.snapshots.some(
    (s) => s.entityId === entityId && s.year === target,
  )
    ? target
    : target - 1;
}
export function latestFiscalSnapshot(
  state: Pick<Store, "snapshots">,
  entityId: string,
  target: number,
): Snapshot | undefined {
  const year = sourceYear(state, entityId, target);
  return state.snapshots
    .filter((s) => s.entityId === entityId && s.year === year)
    .sort((a, b) => b.week - a.week)[0];
}
