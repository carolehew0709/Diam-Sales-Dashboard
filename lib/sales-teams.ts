import type { Snapshot, Store, OrderBookLine } from "./types";

export const teamName = (value?: string) =>
  value?.replace(/\s+/g, " ").trim() || "__unassigned__";

/** Receives only latest, authorized reporting lines, after exclusions and filters. */
export function teamOrderbookSummary(lines: OrderBookLine[], year: number) {
  const groups = new Map<string, OrderBookLine[]>();
  for (const line of lines) {
    const name = teamName(line.salesTeam);
    const group = groups.get(name) ?? [];
    group.push(line);
    groups.set(name, group);
  }
  return [...groups]
    .map(([name, group]) => {
      const monthly = group.map((l) =>
        year === 2027 ? l.monthly2027 : l.monthly2026,
      );
      const evidence = new Map<string, number[]>();
      for (const line of group) {
        const key = `${line.sourceFile} · ${line.sourceSheet}`;
        evidence.set(key, [...(evidence.get(key) ?? []), line.sourceRow]);
      }
      return {
        name,
        value: group.reduce(
          (sum, l) => sum + (year === 2027 ? l.total2027 : l.total2026),
          0,
        ),
        monthly: Array.from({ length: 12 }, (_, i) =>
          monthly.every((m) => m[i] !== null && m[i] !== undefined)
            ? monthly.reduce((sum, m) => sum + m[i]!, 0)
            : null,
        ),
        entityIds: [...new Set(group.map((l) => l.entityId))],
        lineCount: group.length,
        source: [...evidence]
          .map(([source, rows]) => `${source} · rows ${rows.join(", ")}`)
          .join("; "),
      };
    })
    .sort((a, b) => b.value - a.value);
}

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
