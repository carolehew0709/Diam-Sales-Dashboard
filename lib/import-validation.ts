import { randomUUID } from "node:crypto";
import { emptySnapshot, weekDate } from "./workbook-parser";
import { resolveEntity } from "./entities";
import type { ImportBatch, OrderBookLine, User } from "./types";
import { ApiError } from "./auth";
const amount = (v: unknown, label: string, optional = false): number | null => {
  if (v === "" || v === null || v === undefined) {
    if (optional) return null;
    throw new ApiError(400, `${label} is required`);
  }
  if (typeof v !== "number" && typeof v !== "string")
    throw new ApiError(400, `${label} must be numeric`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0)
    throw new ApiError(400, `${label} must be a finite nonnegative number`);
  return n;
};
export function manualBatch(input: unknown, user: User): ImportBatch {
  if (!input || typeof input !== "object")
    throw new ApiError(400, "Invalid submission");
  const b = input as Record<string, unknown>;
  const entity = resolveEntity(String(b.entityId ?? ""));
  if (!entity) throw new ApiError(400, "Unknown entity");
  const year = Number(b.year ?? 2026),
    week = Number(b.week),
    month = Number(b.month);
  if (
    year !== 2026 ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 53 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new ApiError(
      400,
      "Supply reporting year 2026, an integer week 1–53 and month 1–12",
    );
  if (new Date(weekDate(year, week)).getUTCMonth() + 1 !== month)
    throw new ApiError(400, "Reporting month must match the ISO week Friday");
  const source = String(b.source ?? "").trim();
  if (!source) throw new ApiError(400, "Source note is required");
  const s = emptySnapshot(
    entity.id,
    year,
    week,
    month,
    `Manual ${entity.code} W${week}`,
    "Manual entry",
  );
  s.turnover = {
    external: amount(b.turnoverExternal, "YTD external"),
    group: amount(b.turnoverGroup, "YTD group"),
  };
  s.monthTurnover = {
    external: amount(b.monthTurnoverExternal, "MTD external"),
    group: amount(b.monthTurnoverGroup, "MTD group"),
  };
  s.monthEstimate = {
    external: amount(b.monthEstimateExternal, "Month estimate external"),
    group: amount(b.monthEstimateGroup, "Month estimate group"),
  };
  for (const kind of ["external", "group"] as const)
    if (s.monthTurnover[kind]! > s.turnover[kind]!)
      throw new ApiError(400, "MTD turnover cannot exceed YTD turnover");
  s.prospect = amount(b.prospect, "Prospect", true);
  s.nextProspect = amount(b.nextProspect, "2027 Prospect", true);
  s.annualBudget = amount(b.annualBudget, "Annual Dashboard", true);
  s.nextAnnualBudget = amount(
    b.nextAnnualBudget,
    "2027 Annual Dashboard",
    true,
  );
  s.sourceNote = source;
  if (!Array.isArray(b.lines) || b.lines.length > 1000)
    throw new ApiError(400, "Provide at most 1000 order lines");
  const lines: OrderBookLine[] = b.lines.map((raw, index) => {
    const l = raw as Record<string, unknown>;
    if (
      !l ||
      !String(l.product ?? "").trim() ||
      !String(l.customer ?? "").trim()
    )
      throw new ApiError(
        400,
        `Line ${index + 1}: product and customer are required`,
      );
    if (!["External", "Group"].includes(String(l.customerType)))
      throw new ApiError(400, `Line ${index + 1}: choose External or Group`);
    const total2026 = amount(l.total2026, `Line ${index + 1} 2026 total`)!,
      total2027 = amount(l.total2027, `Line ${index + 1} 2027 total`)!;
    const allocation = (key: string, total: number) => {
      const raw = l[key];
      if (!Array.isArray(raw) || raw.length !== 12)
        throw new ApiError(400, `${key}: provide all 12 monthly allocations`);
      const values = raw.map((v, i) => amount(v, `${key} month ${i + 1}`)!);
      if (Math.abs(values.reduce((a, v) => a + v, 0) - total) > 0.01)
        throw new ApiError(
          400,
          `Line ${index + 1}: ${key} must equal the annual order total`,
        );
      return values;
    };
    return {
      id: randomUUID(),
      entityId: entity.id,
      year,
      week,
      product: String(l.product).trim(),
      customer: String(l.customer).trim(),
      customerType: l.customerType as "External" | "Group",
      dgc: l.customerType === "Group" ? "G" : "E",
      quantity: null,
      total2026,
      total2027,
      monthly2026: allocation("monthly2026", total2026),
      monthly2027: allocation("monthly2027", total2027),
      sourceFile: s.sourceFile,
      sourceSheet: s.sourceSheet,
      sourceRow: index + 1,
    };
  });
  for (const kind of ["external", "group"] as const) {
    const subset = lines.filter((l) => l.customerType.toLowerCase() === kind);
    s.orderbook[kind] = subset.reduce((a, l) => a + l.total2026, 0);
    s.nextOrderbook[kind] = subset.reduce((a, l) => a + l.total2027, 0);
    s.monthlyOrderbook[kind] = Array.from({ length: 12 }, (_, i) =>
      subset.reduce((a, l) => a + (l.monthly2026[i] ?? 0), 0),
    );
    s.nextMonthlyOrderbook[kind] = Array.from({ length: 12 }, (_, i) =>
      subset.reduce((a, l) => a + (l.monthly2027[i] ?? 0), 0),
    );
    s.monthlySales[kind][month - 1] = s.monthTurnover[kind];
  }
  s.findings = [];
  if (s.annualBudget === null) s.findings.push("Annual budget not supplied");
  if (s.prospect === null) s.findings.push("Prospect not supplied");
  else if (s.prospect > 0)
    s.findings.push("Prospect monthly phasing not supplied");
  else s.monthlyProspect.fill(0);
  s.findings.push("Historical monthly turnover not supplied");
  s.sourceCheck = "Review";
  return {
    id: randomUUID(),
    fileName: s.sourceFile,
    sourceType: "Manual",
    status: "review",
    entityIds: [entity.id],
    submittedBy: user.id,
    submittedAt: new Date().toISOString(),
    findings: s.findings.map((message) => ({ severity: "review", message })),
    snapshots: [s],
    lines,
    sheets: [],
  };
}
