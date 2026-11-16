import { entities } from "./entities";
import { canView } from "./permissions";
import { rankCustomerGroups } from "./receivables";
import {
  receivableCurrencies,
  type ReceivableRecord,
} from "./receivables-types";
import type { Store, User } from "./types";

export function getReceivablesTrends(state: Store, user: User, today: string) {
  const year = Number(today.slice(0, 4));
  const months = Array.from(
    { length: Number(today.slice(5, 7)) },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  );
  const allowed = entities.filter(
    (entity) => ["dhk", "ddc"].includes(entity.id) && canView(user, entity),
  );
  const dates = new Map<string, Map<string, ReceivableRecord[]>>();
  const addSnapshot = (records: ReceivableRecord[]) => {
    const snapshot = new Map<string, Map<string, ReceivableRecord[]>>();
    for (const row of records) {
      const date = row.asOfDate;
      if (
        row.category !== "invoice" ||
        !date ||
        date > today ||
        !months.includes(date.slice(0, 7)) ||
        !allowed.some((entity) => entity.id === row.entityId)
      )
        continue;
      const byDate = snapshot.get(row.entityId) ?? new Map();
      const rows = byDate.get(date) ?? [];
      rows.push(row);
      byDate.set(date, rows);
      snapshot.set(row.entityId, byDate);
    }
    for (const [entityId, byDate] of snapshot) {
      const known = dates.get(entityId) ?? new Map();
      for (const [date, rows] of byDate) known.set(date, rows);
      dates.set(entityId, known);
    }
  };
  const publications = state.batches
    .filter(
      (batch) =>
        batch.status === "published" &&
        batch.receivablesKind === "aging" &&
        !batch.adjustedRecordId &&
        !batch.publication?.restoredAt,
    )
    .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
  for (const batch of publications) {
    addSnapshot(batch.publication?.before.receivables ?? []);
    addSnapshot(
      batch.publication?.after.receivables ?? batch.receivables ?? [],
    );
  }
  addSnapshot(state.receivables ?? []);
  const panels = allowed.flatMap((entity) => {
    const byDate =
      dates.get(entity.id) ?? new Map<string, ReceivableRecord[]>();
    const ascending = [...byDate.keys()].sort();
    const snapshots = months.map((month) => {
      const date = ascending.findLast((value) => value.startsWith(month));
      return date
        ? { date, ranking: rankCustomerGroups(byDate.get(date)!) }
        : null;
    });
    return receivableCurrencies.flatMap((currency) => {
      const rankedMonths = snapshots.map(
        (snapshot) =>
          snapshot?.ranking.filter((row) => row.currency === currency) ?? [],
      );
      const latestIndex = rankedMonths.findLastIndex((rows) => rows.length > 0);
      if (latestIndex === -1) return [];
      const groups = [
        ...new Set(rankedMonths.flat().map((row) => row.customerGroup)),
      ].sort();
      return [
        {
          entityId: entity.id,
          entityCode: entity.code,
          currency,
          latestDate: snapshots[latestIndex]!.date,
          observedMonths: rankedMonths.filter((rows) => rows.length).length,
          top: rankedMonths[latestIndex]
            .slice(0, 5)
            .map((row) => row.customerGroup),
          series: groups.map((name) => ({
            name,
            values: rankedMonths.map(
              (rows) =>
                rows.find((row) => row.customerGroup === name)?.amount ?? null,
            ),
          })),
        },
      ];
    });
  });
  return {
    year,
    months,
    entities: allowed.map(({ id, code }) => ({ id, code })),
    panels,
  };
}

export type ReceivablesTrends = ReturnType<typeof getReceivablesTrends>;
