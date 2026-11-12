"use client";
import { memo, useRef } from "react";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import { ComboPlot } from "./graphic-plots";
import { useWorkbookGroup } from "./use-workbook-group";
import { months, type Dashboard } from "@/lib/dashboard";
import {
  firstOpenMonth,
  monthlyPerformanceSeries,
} from "@/lib/performance-chart";

export const SalesMonthlyGraphic = memo(function SalesMonthlyGraphic({
  data,
  index = 0,
  standalone = false,
  exportOnly = false,
  comparisonRow,
}: {
  data: Dashboard;
  index?: number;
  standalone?: boolean;
  exportOnly?: boolean;
  comparisonRow?: Dashboard["rows"][number];
}) {
  const { tr, display } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(
    root,
    standalone && !exportOnly
      ? () => (
          <SalesMonthlyGraphic
            data={data}
            index={index}
            standalone
            exportOnly
            comparisonRow={comparisonRow}
          />
        )
      : null,
  );
  const series = comparisonRow ? { id: comparisonRow.entity.id, name: comparisonRow.entity.code } : data.graphics.series[index];
  const selectedRows =
    comparisonRow ? [comparisonRow] : index === 0
      ? data.rows
      : data.rows.filter((r) => r.entity.id === series.id);
  const metrics = comparisonRow?.metrics ?? (index === 0 ? data.totals : selectedRows[0].metrics);
  const openMonth = firstOpenMonth(
    data.filters.year,
    selectedRows.map((r) => r.snapshot),
  );
  const actualScoped = !!data.graphics.teamKpiSource && selectedRows.length>0 && selectedRows.every(r=>r.snapshot?.teamActualSource);
  const dimensionScoped = !!(data.filters.salesTeam && data.filters.salesTeam !== "all") ||
    !!(data.filters.customer && data.filters.customer !== "all");
  const view = monthlyPerformanceSeries(
    metrics,
    data.filters.scenario,
    dimensionScoped,
  );
  const prospectOnly = view.key === "orderbook";
  const salesOnly = view.key === "sales";
  const monthlyLabel = tr(
    salesOnly ? "graphics.monthlySales" : prospectOnly
      ? "graphics.monthlyScopedOB"
      : "graphics.monthlyConfirmed",
  );
  const cumulativeLabel = tr(
    salesOnly ? "graphics.cumulativeSales" : prospectOnly
      ? "graphics.cumulativeScopedOB"
      : "graphics.cumulativeConfirmed",
  );
  const week =
    [...new Set(selectedRows.flatMap((row) => row.snapshot ? [actualScoped ? row.snapshot.teamActualSource?.week ?? row.snapshot.week : row.snapshot.week] : []))].sort((a, b) => a - b).map((w) => `W${w}`).join(" / ") || tr("snapshot.none");
  const filters = comparisonRow ? { ...data.filters, bu: comparisonRow.entity.businessUnit, entity: comparisonRow.entity.id } : data.filters;
  const context = `${tr("graphics.weekly", { week })} · ${filters.year} · ${display(filters.region)} · ${filters.bu === "all" ? tr("filters.allBU") : filters.bu} · ${filters.salesType === "all" ? tr("filters.allSales") : display(filters.salesType)} · ${prospectOnly ? "" : `${display(filters.scenario)} · `}${filters.salesTeam === "all" || !filters.salesTeam ? tr("team.all") : filters.salesTeam} · ${filters.customer && filters.customer !== "all" ? filters.customer + " · " : ""}kEUR`;
  const sources = [
    ...new Set(
      selectedRows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])),
    ),
  ].join("; ");
  const closeFiles = [...new Set(selectedRows.flatMap((r) =>
    r.monthlyClose ? [r.monthlyClose.sourceFile] : [],
  ))];
  const sourceFor = (monthIndex: number) =>
    selectedRows
      .map(
        (r) => r.monthlyClose && monthIndex < r.monthlyClose.monthly.length
          ? `${r.entity.code}: ${r.monthlyClose.sourceFile} · ${r.monthlyClose.sourceSheet} · ${r.monthlyClose.sourceRange}`
          : `${r.entity.code}: ${r.snapshot?.teamActualSource ? `Actual W${r.snapshot.teamActualSource.week??"—"} · ${r.snapshot.teamActualSource.sourceFile} · ${r.snapshot.teamActualSource.sourceSheet}; Prospect ` : ""}${r.snapshot ? `W${r.snapshot.week} · ${r.snapshot.sourceFile} · ${r.snapshot.sourceSheet}` : "—"}`,
      )
      .join("; ");
  const scopeName =
    filters.entity !== "all"
      ? (selectedRows[0]?.entity.code ?? filters.entity)
      : filters.bu !== "all"
        ? filters.bu
        : display(filters.region);
  const title = tr(
    prospectOnly ? "graphics.scopedPerformanceFor" : "graphics.performanceFor",
    {
      name: comparisonRow ? comparisonRow.entity.code : index === 0 ? scopeName : series.name,
    },
  );
  const closeNote = closeFiles.length ? tr("graphics.monthlyCloseRule", { source: closeFiles.join(" · ") }) : "";
  const rule = tr(salesOnly ? "graphics.salesRule" : prospectOnly ? "graphics.scopedOBRule" : "graphics.planningRule");
  const note = `${closeNote} ${actualScoped ? tr("teamKpi.scope",data.graphics.teamKpiSource!) : ""} ${rule} ${prospectOnly ? "" : tr("graphics.periodColorsRule")} ${tr("graphics.weeklyRule")} ${tr("graphics.source", { source: sources || tr("common.review") })}`;
  const exact = (v: number | null) =>
    v === null
      ? "—"
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <div
      ref={root}
      className={
        standalone
          ? "monthly-sales-graphic primary-sales-graphic"
          : "monthly-sales-graphic"
      }
    >
      <GraphicCard
        title={title}
        context={context}
        note={note}
        exportNote={note}
        height={395}
        exportTable={{
          columns: [
            { label: tr("common.month") },
            { label: `${monthlyLabel} (kEUR)` },
            { label: `${cumulativeLabel} (kEUR)` },
            { label: tr("common.source") },
          ],
          rows: view.points.map((p, i) => [
            display(months[i]),
            p.monthly,
            p.ytd,
            sourceFor(i),
          ]),
        }}
        table={
          <table className="bu-table">
            <thead>
              <tr>
                <th>{tr("common.month")}</th>
                <th className="numeric">{monthlyLabel}</th>
                <th className="numeric">{cumulativeLabel}</th>
                <th>{tr("common.source")}</th>
              </tr>
            </thead>
            <tbody>
              {view.points.map((p, i) => (
                <tr key={i}>
                  <td>{display(months[i])}</td>
                  <td className="numeric">{exact(p.monthly)}</td>
                  <td className="numeric">{exact(p.ytd)}</td>
                  <td>{sourceFor(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ComboPlot
          points={view.points.map((p, i) => ({
            ...p,
            label: display(months[i]),
            estimated: actualScoped && data.filters.scenario === "Sales" ? i >= data.graphics.teamKpiSource!.month : openMonth === null ? null : i >= openMonth,
          }))}
          monthlyLabel={monthlyLabel}
          ytdLabel={cumulativeLabel}
          empty={tr(
            salesOnly ? "graphics.noSales" : prospectOnly
              ? "graphics.noTeam"
              : "graphics.noPlanning",
          )}
        />
      </GraphicCard>
    </div>
  );
});
