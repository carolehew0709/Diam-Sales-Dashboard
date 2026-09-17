import * as XLSX from "xlsx-js-style";
import { currentUser, ApiError } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { filtersFrom, getDashboardSnapshot, months } from "@/lib/dashboard";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const state = await repository.read();
    const filters = filtersFrom(new URL(request.url));
    const d = getDashboardSnapshot(state, user, filters);
    const wb = XLSX.utils.book_new();
    const context = [
      `${filters.year} · ${filters.region} / ${filters.bu} / ${filters.entity} · ${filters.scenario} · ${filters.salesType} · kEUR · ${d.weeks.map((w) => `W${w}`).join(", ")}`,
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
              cell.z =
                name === "Executive Summary" && c === 7 ? "0.0%" : "#,##0.0";
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
        "Annual Dashboard",
        "Sales to date",
        "Orderbook",
        "Sales & Dashboard",
        "Prospect",
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
      [
        "Missing values remain blank. Totals with unavailable entity inputs are partial; coverage and gap require complete comparable data.",
      ],
    ]);
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
        "OB external",
        "OB group",
        "Prospect",
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
    add("Orderbook Detail", [
      [
        "Entity",
        "Week",
        "Product",
        "Customer",
        "Type",
        "2026 total",
        "2027 total",
        ...months.map((m) => `${m} 2026`),
        ...months.map((m) => `${m} 2027`),
        "Source",
        "Sheet",
        "Row",
      ],
      ...state.lines
        .filter(
          (l) =>
            d.rows.some(
              (r) => r.entity.id === l.entityId && r.snapshot?.week === l.week,
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
          l.total2026,
          l.total2027,
          ...l.monthly2026,
          ...l.monthly2027,
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
        "OB 2027 external",
        "OB 2027 group",
        "Prospect",
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
          ["Sales & Dashboard", "base"],
          ["Prospect", "prospect"],
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
        "Monthly Sales & Dashboard",
        "Monthly scenario",
        "Cumulative budget",
        "Cumulative Sales & Dashboard",
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
