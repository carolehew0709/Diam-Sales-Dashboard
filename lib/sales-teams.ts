import type { Snapshot, Store } from "./types";

export const teamName = (value?: string) =>
  value?.replace(/\s+/g, " ").trim() || "__unassigned__";

/** Project only source-backed team OB. Do not allocate BU invoices or budgets to teams. */
export function salesTeamState(state: Store, salesTeam = "all"): Store {
  if (salesTeam === "all") return state;
  const lines = state.lines.filter(
    (line) => teamName(line.salesTeam) === salesTeam,
  );
  const snapshots = state.snapshots.map((s): Snapshot => {
    if (s.teamScope) return s;
    const source = state.lines.filter(
      (line) =>
        line.entityId === s.entityId &&
        line.year === s.year &&
        line.week === s.week,
    );
    const selected = lines.filter(
      (line) =>
        line.entityId === s.entityId &&
        line.year === s.year &&
        line.week === s.week,
    );
    const sum = (kind: string, year: 2026 | 2027, month?: number) =>
      source.length
        ? selected
            .filter((line) => line.customerType.toLowerCase() === kind)
            .reduce(
              (n, line) =>
                n +
                (month === undefined
                  ? line[`total${year}`]
                  : (line[`monthly${year}`][month] ?? 0)),
              0,
            )
        : null;
    const empty = () => Array<null>(12).fill(null);
    return {
      ...s,
      teamScope: true,
      turnover: { external: null, group: null },
      monthTurnover: { external: null, group: null },
      monthEstimate: { external: null, group: null },
      orderbook: { external: sum("external", 2026), group: sum("group", 2026) },
      nextOrderbook: {
        external: sum("external", 2027),
        group: sum("group", 2027),
      },
      monthlyOrderbook: {
        external: Array.from({ length: 12 }, (_, m) =>
          sum("external", 2026, m),
        ),
        group: Array.from({ length: 12 }, (_, m) => sum("group", 2026, m)),
      },
      nextMonthlyOrderbook: {
        external: Array.from({ length: 12 }, (_, m) =>
          sum("external", 2027, m),
        ),
        group: Array.from({ length: 12 }, (_, m) => sum("group", 2027, m)),
      },
      monthlySales: { external: empty(), group: empty() },
      annualBudget: null,
      nextAnnualBudget: null,
      monthlyBudget: empty(),
      prospect: null,
      nextProspect: null,
      monthlyProspect: empty(),
      nextOrderbookOverride: undefined,
      ddcAnnualTotal: undefined,
      salesCardValue: undefined,
      sourceExternalOrderbook: undefined,
      sourceExternalMonthlyOrderbook: undefined,
      baseOverride: null,
      monthlyBaseOverride: null,
      findings: [
        ...new Set([
          ...s.findings,
          "Team invoices and budget not supplied; only team orderbook is available",
        ]),
      ],
    };
  });
  return { ...state, snapshots, lines };
}
