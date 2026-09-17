import * as XLSX from "xlsx";
import { resolveEntity } from "./entities";
import type { Amount, Finding, OrderBookLine, Snapshot } from "./types";
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const number = (v: unknown): Amount =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const text = (v: unknown) => String(v ?? "").trim();
const blank = () => Array<Amount>(12).fill(null);
export function weekDate(year: number, week: number) {
  const d = new Date(Date.UTC(year, 0, 4));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + (week - 1) * 7 + 4);
  return d.toISOString().slice(0, 10);
}
export function emptySnapshot(
  entityId: string,
  year: number,
  week: number,
  month: number,
  file: string,
  sheet: string,
): Snapshot {
  return {
    entityId,
    year,
    week,
    month,
    asOfDate: weekDate(year, week),
    turnover: { external: null, group: null },
    monthTurnover: { external: null, group: null },
    monthEstimate: { external: null, group: null },
    orderbook: { external: null, group: null },
    nextOrderbook: { external: null, group: null },
    baseOverride: null,
    monthlyBaseOverride: null,
    prospect: null,
    nextProspect: null,
    annualBudget: null,
    nextAnnualBudget: null,
    monthlyBudget: blank(),
    monthlyProspect: blank(),
    monthlySales: { external: blank(), group: blank() },
    monthlyOrderbook: { external: blank(), group: blank() },
    nextMonthlyOrderbook: { external: blank(), group: blank() },
    sourceFile: file,
    sourceSheet: sheet,
    sourceNote: "",
    sourceCells: {},
    findings: [],
    sourceCheck: "Review",
  };
}
export function parseDashboardWorkbook(bytes: Buffer, fileName: string) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellFormula: true });
  const snapshots: Snapshot[] = [];
  const lines: OrderBookLine[] = [];
  const findings: Finding[] = [];
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows:
      XLSX.utils.decode_range(workbook.Sheets[name]["!ref"] ?? "A1").e.r + 1,
    kind: /^W\d+$/.test(name)
      ? "Entity week"
      : name === "Data Weekly"
        ? "Weekly summary"
        : "Supporting",
  }));
  const year = Number(fileName.match(/20\d{2}/)?.[0] ?? 2026);
  for (const name of workbook.SheetNames.filter((n) => /^W\d+$/.test(n))) {
    const ws = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
    }) as unknown[][];
    const at = (r: number, c: number) => rows[r]?.[c];
    const cell = (r: number, c: number) =>
      XLSX.utils.encode_cell({ r: r + range.s.r, c: c + range.s.c });
    const entity = resolveEntity(text(at(1, 3)));
    const week = Number(text(at(3, 3)).replace(/^W/i, ""));
    const populated =
      number(at(9, 4)) !== null ||
      number(at(10, 4)) !== null ||
      rows.slice(23).some((r) => text(r[1]) || text(r[3]));
    if (!populated) continue;
    if (!entity || !Number.isInteger(week) || week < 1 || week > 53) {
      findings.push({
        severity: "error",
        message: `${name}: unknown entity or invalid week`,
      });
      continue;
    }
    const month =
      months.findIndex(
        (m) => m.toLowerCase() === text(at(5, 3)).toLowerCase(),
      ) + 1;
    if (!month) {
      findings.push({
        severity: "error",
        message: `${name}: unrecognized reporting month`,
      });
      continue;
    }
    const s = emptySnapshot(entity.id, year, week, month, fileName, name);
    s.turnover = { external: number(at(9, 4)), group: number(at(10, 4)) };
    s.monthTurnover = { external: number(at(9, 6)), group: number(at(10, 6)) };
    s.monthEstimate = { external: number(at(9, 8)), group: number(at(10, 8)) };
    s.orderbook = { external: number(at(16, 7)), group: number(at(17, 7)) };
    s.nextOrderbook = { external: number(at(16, 8)), group: number(at(17, 8)) };
    for (const [kind, r] of [
      ["external", 16],
      ["group", 17],
    ] as const) {
      s.monthlyOrderbook[kind] = Array.from({ length: 12 }, (_, i) =>
        number(at(r, 10 + i)),
      );
      s.nextMonthlyOrderbook[kind] = Array.from({ length: 12 }, (_, i) =>
        number(at(r, 23 + i)),
      );
    }
    s.sourceCells = {
      turnover: `${cell(9, 4)}:${cell(10, 4)}`,
      monthTurnover: `${cell(9, 6)}:${cell(10, 6)}`,
      monthEstimate: `${cell(9, 8)}:${cell(10, 8)}`,
      orderbook: `${cell(16, 7)}:${cell(17, 8)}`,
      monthlyOrderbook: `${cell(16, 10)}:${cell(17, 34)}`,
    };
    s.findings = ["Annual budget not supplied", "Prospect not supplied"];
    if (text(at(20, 6)).toUpperCase() !== "OK")
      s.findings.push("Workbook source check requires review");
    for (let i = 23; i < rows.length; i++) {
      const r = rows[i];
      if (!text(r[1]) && !text(r[3])) continue;
      const type = text(r[2]).toLowerCase();
      const customerType =
        type === "external"
          ? "External"
          : ["group", "internal"].includes(type)
            ? "Group"
            : "Unclassified";
      const line: OrderBookLine = {
        id: `${entity.id}:${year}:${week}:${i + range.s.r + 1}`,
        entityId: entity.id,
        year,
        week,
        product: text(r[1]),
        customer: text(r[3]),
        customerType,
        dgc: text(r[5]),
        quantity: number(r[4]),
        total2026: number(r[7]) ?? 0,
        total2027: number(r[8]) ?? 0,
        monthly2026: Array.from(
          { length: 12 },
          (_, m) => number(r[10 + m]) ?? 0,
        ),
        monthly2027: Array.from(
          { length: 12 },
          (_, m) => number(r[23 + m]) ?? 0,
        ),
        sourceFile: fileName,
        sourceSheet: name,
        sourceRow: i + range.s.r + 1,
      };
      if (customerType === "Unclassified")
        s.findings.push(
          `Row ${line.sourceRow}: External/Group classification missing`,
        );
      for (const y of [2026, 2027] as const)
        if (
          Math.abs(
            line[`monthly${y}`].reduce<number>((sum, v) => sum + (v ?? 0), 0) -
              line[`total${y}`],
          ) > 0.1
        )
          s.findings.push(
            `Row ${line.sourceRow}: ${y} monthly allocations do not match total`,
          );
      lines.push(line);
    }
    for (const kind of ["external", "group"] as const) {
      const detail = lines.filter(
        (l) =>
          l.entityId === entity.id &&
          l.week === week &&
          l.customerType.toLowerCase() === kind,
      );
      const total = detail.reduce((a, l) => a + l.total2026, 0);
      if (
        s.orderbook[kind] !== null &&
        Math.abs(total - s.orderbook[kind]!) > 0.1
      )
        s.findings.push(`${kind} order detail does not reconcile to summary`);
    }
    snapshots.push(s);
  }
  // Closed month end = next month YTD minus next month MTD; a last weekly snapshot need not fall on calendar month end.
  for (const s of snapshots)
    for (const kind of ["external", "group"] as const)
      for (let m = 1; m <= s.month; m++) {
        if (m === s.month) {
          s.monthlySales[kind][m - 1] = s.monthTurnover[kind];
          continue;
        }
        const last = (month: number) =>
          snapshots
            .filter(
              (x) =>
                x.entityId === s.entityId &&
                x.year === s.year &&
                x.month === month &&
                x.week <= s.week,
            )
            .sort((a, b) => b.week - a.week)[0];
        const monthEnd = (next: Snapshot | undefined) =>
          next &&
          next.turnover[kind] !== null &&
          next.monthTurnover[kind] !== null
            ? next.turnover[kind]! - next.monthTurnover[kind]!
            : null;
        const current = monthEnd(last(m + 1)),
          previous = m === 1 ? 0 : monthEnd(last(m));
        s.monthlySales[kind][m - 1] =
          current !== null && previous !== null ? current - previous : null;
      }
  if (workbook.Sheets["Data Weekly"]) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets["Data Weekly"],
      { header: 1, defval: null },
    ) as unknown[][];
    const budget = rows.find((r) => r[0] === "PDA" && r[3] === "Budget");
    const recap = workbook.Sheets["Budget Recap"]
      ? (XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Budget Recap"], {
          header: 1,
          defval: null,
        }) as unknown[][])
      : [];
    const pdaStart = recap.findIndex((r) => String(r[1]).startsWith("PDA"));
    const prospect =
      pdaStart >= 0
        ? recap.slice(pdaStart + 1).find((r) => r[2] === "P1")
        : undefined;
    const currentWeek = Number(fileName.match(/W(\d+)/)?.[1] ?? 0);
    for (const [i, r] of rows.entries())
      if (r[0] === "PDA" && /^W\d+$/.test(text(r[3]))) {
        const week = Number(r[4]);
        const s = emptySnapshot(
          "dcp",
          year,
          week,
          new Date(weekDate(year, week)).getUTCMonth() + 1,
          fileName,
          "Data Weekly",
        );
        s.baseOverride = number(r[17]);
        s.monthlyBaseOverride = r.slice(5, 17).map(number);
        s.annualBudget = number(budget?.[17]);
        s.monthlyBudget = budget ? budget.slice(5, 17).map(number) : blank();
        if (week === currentWeek && prospect) {
          s.monthlyProspect = prospect.slice(3, 15).map(number);
          s.prospect = s.monthlyProspect.every((v) => v !== null)
            ? s.monthlyProspect.reduce<number>((a, v) => a + v!, 0)
            : null;
        }
        s.sourceCells = {
          annualBase: `R${i + 1}`,
          monthlyBase: `F${i + 1}:Q${i + 1}`,
          budget: "Data Weekly · PDA Budget",
          prospect: "Budget Recap · PDA P1",
        };
        s.sourceNote =
          "PDA aggregate mapped to DCP as confirmed by project owner. Original source label: Asia (PDA + PDN + PGC).";
        s.findings = [
          "Legacy aggregate mapped to DCP; entity-level allocation not supplied",
          "Sales/OB and External/Group splits not supplied",
          "Current-month invoicing not supplied",
        ];
        snapshots.push(s);
      }
  }
  if (!snapshots.length)
    findings.push({
      severity: "error",
      message: "No supported populated entity-week snapshots found",
    });
  const issues = [...new Set(snapshots.flatMap((s) => s.findings))];
  findings.push(
    ...issues.map((message) => ({ severity: "review" as const, message })),
  );
  return { snapshots, lines, findings, sheets };
}
