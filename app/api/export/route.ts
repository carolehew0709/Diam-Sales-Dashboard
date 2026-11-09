import { teamReportingState } from "@/lib/team-reporting";
import { lineYear } from "@/lib/fiscal-years";
import { reportingPeriod } from '@/lib/reporting-period';
import { policyState } from "@/lib/governance";
import { reportingState } from "@/lib/intercompany";
import { salesTeamState, matchesOrderDimensions } from "@/lib/sales-teams";
import * as XLSX from "xlsx-js-style";
import { currentUser, ApiError } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { filtersFrom, getDashboardSnapshot, months } from "@/lib/dashboard";
import { translate } from "@/lib/i18n";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const filters = filtersFrom(new URL(request.url));
    const rawState = reportingState(
      policyState(teamReportingState(reportingPeriod(await repository.read(),filters.week), filters), filters.salesType),
      filters.salesType,
    );
    const state = {
      ...salesTeamState(rawState, filters.salesTeam, filters.customer),
      intercompanyExcluded: rawState.intercompanyExcluded.filter((line) =>
        matchesOrderDimensions(line, filters.salesTeam, filters.customer),
      ),
    };
    const d = getDashboardSnapshot(state, user, filters);
    const wb = XLSX.utils.book_new();
    const context = [
      `${filters.year} · ${filters.region} / ${filters.bu} / ${filters.entity} · Team: ${filters.salesTeam ?? "all"} · Customer: ${filters.customer ?? "all"} · ${filters.scenario} · ${filters.salesType} · kEUR · ${d.weeks.map((w) => `W${w}`).join(", ")}`,
    ];
    function add(name: string, rows: unknown[][]) {
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = rows
        .reduce<number[]>(
          (widths, row) =>
            row.map((v, i) =>
              Math.min(
                46,
                Math.max(widths[i] ?? 12, String(v ?? "").length + 2),
              ),
            ),
          [],
        )
        .map((wch) => ({ wch }));
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
      for (let r = 0; r <= range.e.r; r++)
        for (let c = 0; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })];
          if (cell) {
            cell.s = {
              font: {
                name: "Arial",
                sz: 10,
                color: { rgb: r === 0 ? "FFFFFF" : "171813" },
              },
              ...(r === 0
                ? { fill: { patternType: "solid", fgColor: { rgb: "171813" } } }
                : {}),
            };
            if (typeof cell.v === "number")
              cell.z = name === "Executive Summary" && c === 7 ? "0%" : "#,##0";
          }
        }
      XLSX.utils.book_append_sheet(wb, sheet, name);
    }
    add("Executive Summary", [
      ["DIAM APAC Sales Performance"],
      context,
      [],
      [
        "Entity",
        translate("en", "metric.budget"),
        "Sales to date",
        translate("en", "metric.ob"),
        translate("en", "metric.base"),
        translate("en", "metric.prospect"),
        "Selected scenario",
        "Coverage",
        "Residual gap",
        "Remaining this month",
        "Source week",
        "Source status",
      ],
      ...d.rows.map((r) => [
        r.entity.code,
        r.metrics.budget,
        r.metrics.sales,
        r.metrics.orderbook,
        r.metrics.base,
        r.metrics.prospect,
        r.metrics.scenario,
        r.metrics.coverage,
        r.metrics.gap,
        r.metrics.remaining,
        r.snapshot?.week ?? null,
        r.snapshot ? "Review" : "Missing",
      ]),
      [
        "Selected total",
        d.totals.budget,
        d.totals.sales,
        d.totals.orderbook,
        d.totals.base,
        d.totals.prospect,
        d.totals.scenario,
        d.totals.coverage,
        d.totals.gap,
        d.totals.remaining,
      ],
      [translate("en", "export.missingNote")],
      ...(!d.totals.budgetComplete && d.totals.budget !== null
        ? [
            [
              `Annual budget includes confirmed budgets: ${
                d.rows
                  .filter((r) => r.metrics.budgetComplete)
                  .map((r) => r.entity.code)
                  .join(" + ") || "none"
              }; pending FY2027 budgets counted as 0 for provisional Coverage/Gap, not approved.`,
            ],
          ]
        : []),
    ]);
    if(d.graphics.teamActuals){ const t=d.graphics.teamActuals; add("Team actual Sales",[["Team actual Sales / 团队实际销售 · kEUR"],[`${t.reportingWeek ? `W${t.reportingWeek} · ` : ""}${t.year}-${String(t.month).padStart(2,"0")} · ${t.sourceFile} · ${t.sourceSheet}`],["Team / 团队","Sales / 实际销售","Team annual budget / 团队年度预算","Attainment / 完成率",...months,"Entities / 实体"],...t.groups.map(r=>[r.name,r.sales,r.budget,r.attainment,...r.monthly,r.entityIds.join(" / ")]),["TOTAL",t.sales,t.budget,t.attainment,...t.monthly],[translate("en","teamActual.sourceYtd"),t.sourceSales],[translate("en","teamActual.excludedGroup"),t.excludedDdcGroup],[translate("en",t.unavailable?"teamActual.unavailable":"teamActual.rule")]]); }
    add("Weekly Review", [
      ["Entity", "Week", "Selected annual scenario (kEUR)"],
      ...d.history.flatMap((r) =>
        r.records.map((s) => [r.entity.code, s.week, s.value]),
      ),
    ]);
    add("Data Weekly", [
      [
        "Entity",
        "Year",
        "Week",
        "YTD external",
        "YTD group",
        "MTD external",
        "MTD group",
        `${translate("en", "metric.ob")} external`,
        `${translate("en", "metric.ob")} group`,
        translate("en", "metric.prospect"),
        "Source",
        "Sheet",
      ],
      ...state.snapshots
        .filter((s) => d.rows.some((r) => r.entity.id === s.entityId))
        .map((s) => [
          s.entityId,
          s.year,
          s.week,
          s.turnover.external,
          s.turnover.group,
          s.monthTurnover.external,
          s.monthTurnover.group,
          s.orderbook.external,
          s.orderbook.group,
          s.prospect,
          s.sourceFile,
          s.sourceSheet,
        ]),
    ]);
    add(translate("en", "export.prospectDetail"), [
      [
        "Entity",
        "Week",
        translate("en", "order.product"),
        translate("en", "export.originalCustomer"),
        "Type",
        "Sales Team",
        `${filters.year} total`,
        `${filters.year + 1} total`,
        ...months.map((m) => `${m} ${filters.year}`),
        ...months.map((m) => `${m} ${filters.year + 1}`),
        "Source",
        "Sheet",
        "Row",
      ],
      ...state.lines
        .filter(
          (l) =>
            d.rows.some(
              (r) =>
                r.entity.id === l.entityId &&
                r.snapshot?.week === l.week &&
                r.snapshot?.year === l.year,
            ) &&
            (filters.salesType === "all" ||
              l.customerType.toLowerCase() === filters.salesType),
        )
        .map((l) => [
          l.entityId,
          l.week,
          l.product,
          l.customer,
          l.customerType,
          l.salesTeam ?? "",
          lineYear(l, filters.year).total,
          lineYear(l, filters.year + 1).total,
          ...lineYear(l, filters.year).monthly,
          ...lineYear(l, filters.year + 1).monthly,
          l.sourceFile,
          l.sourceSheet,
          l.sourceRow,
        ]),
    ]);
    add("Intercompany Exclusions", [
      [
        "Entity",
        "Week",
        "Customer",
        `${filters.year} excluded`,
        `${filters.year + 1} excluded`,
        ...months.map((m) => `${m} ${filters.year} excluded`),
        ...months.map((m) => `${m} ${filters.year + 1} excluded`),
        "Source",
        "Sheet",
        "Row",
      ],
      ...state.intercompanyExcluded
        .filter(
          (l) =>
            d.rows.some(
              (r) =>
                r.entity.id === l.entityId &&
                r.snapshot?.week === l.week &&
                r.snapshot?.year === l.year,
            ) && filters.salesType !== "external",
        )
        .map((l) => [
          l.entityId,
          l.week,
          l.customer,
          lineYear(l, filters.year).total,
          lineYear(l, filters.year + 1).total,
          ...lineYear(l, filters.year).monthly,
          ...lineYear(l, filters.year + 1).monthly,
          l.sourceFile,
          l.sourceSheet,
          l.sourceRow,
        ]),
    ]);
    add("Entity Snapshots", [
      [
        "Entity",
        "Week",
        "Month",
        "YTD external",
        "YTD group",
        "MTD external",
        "MTD group",
        "Estimate external",
        "Estimate group",
        `${translate("en", "metric.ob")} next source year external`,
        `${translate("en", "metric.ob")} next source year group`,
        translate("en", "metric.prospect"),
        "Source note",
      ],
      ...d.rows
        .filter((r) => r.snapshot)
        .map((r) => {
          const s = r.snapshot!;
          return [
            r.entity.code,
            s.week,
            s.month,
            s.turnover.external,
            s.turnover.group,
            s.monthTurnover.external,
            s.monthTurnover.group,
            s.monthEstimate.external,
            s.monthEstimate.group,
            s.nextOrderbook.external,
            s.nextOrderbook.group,
            s.prospect,
            s.sourceNote,
          ];
        }),
    ]);
    add("Budget Recap", [
      ["Entity", "Metric", ...months, "FY total"],
      ...d.rows.flatMap((r) =>
        [
          ["Budget", "budget"],
          [translate("en", "metric.base"), "base"],
          [translate("en", "metric.prospect"), "prospect"],
          ["Selected scenario", "scenario"],
        ].map(([label, key]) => [
          r.entity.code,
          label,
          ...r.metrics.monthly.map(
            (m) => m[key as "budget" | "base" | "prospect" | "scenario"],
          ),
          r.metrics[key as "budget" | "base" | "prospect" | "scenario"],
        ]),
      ),
    ]);
    add("Chart Data", [
      [
        "Month",
        "Monthly budget",
        translate("en", "graphics.monthlyConfirmed"),
        "Monthly scenario",
        "Cumulative budget",
        translate("en", "graphics.cumulativeConfirmed"),
        "Cumulative scenario",
      ],
      ...d.totals.monthly.map((m, i) => [
        m.label,
        m.budget,
        m.base,
        m.scenario,
        d.totals.cumulative[i].budget,
        d.totals.cumulative[i].base,
        d.totals.cumulative[i].scenario,
      ]),
    ]);
    add("Management Checks", [
      ["Entity", "Check"],
      ...d.checks.map((c) => [c.entity, c.message]),
    ]);
    return new Response(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="DIAM_APAC_${filters.year}_${filters.entity}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof ApiError ? e.message : "Export failed" },
      { status: e instanceof ApiError ? e.status : 500 },
    );
  }
}
