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
  const view = monthlyPerformanceSeries(
    metrics,
    data.filters.scenario,
    data.filters.customer && data.filters.customer !== "all" ? "selection" : data.filters.salesTeam,
  );
  const teamScoped =
    (!!data.filters.salesTeam && data.filters.salesTeam !== "all") || (!!data.filters.customer && data.filters.customer !== "all");
  const monthlyLabel = tr(
    teamScoped
      ? "graphics.monthlyScopedOB"
      : view.key === "scenario"
        ? "graphics.monthlyScenario"
        : "graphics.monthlyConfirmed",
  );
  const cumulativeLabel = tr(
    teamScoped
      ? "graphics.cumulativeScopedOB"
      : view.key === "scenario"
        ? "graphics.cumulativeScenario"
        : "graphics.cumulativeConfirmed",
  );
  const week =
    [...new Set(selectedRows.flatMap((row) => row.snapshot ? [row.snapshot.week] : []))].sort((a, b) => a - b).map((w) => `W${w}`).join(" / ") || tr("snapshot.none");
  const filters = comparisonRow ? { ...data.filters, bu: comparisonRow.entity.businessUnit, entity: comparisonRow.entity.id } : data.filters;
  const context = `${tr("graphics.weekly", { week })} · ${filters.year} · ${display(filters.region)} · ${filters.bu === "all" ? tr("filters.allBU") : filters.bu} · ${filters.salesType === "all" ? tr("filters.allSales") : display(filters.salesType)} · ${teamScoped ? "" : `${display(filters.scenario)} · `}${filters.salesTeam === "all" || !filters.salesTeam ? tr("team.all") : filters.salesTeam} · ${filters.customer && filters.customer !== "all" ? filters.customer + " · " : ""}kEUR`;
  const sources = [
    ...new Set(
      selectedRows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])),
    ),
  ].join("; ");
  const sourceFor = () =>
    selectedRows
      .map(
        (r) =>
          `${r.entity.code}: ${r.snapshot ? `W${r.snapshot.week} · ${r.snapshot.sourceFile} · ${r.snapshot.sourceSheet}` : "—"}`,
      )
      .join("; ");
  const scopeName =
    filters.entity !== "all"
      ? (selectedRows[0]?.entity.code ?? filters.entity)
      : filters.bu !== "all"
        ? filters.bu
        : display(filters.region);
  const title = tr(
    teamScoped ? "graphics.scopedPerformanceFor" : "graphics.performanceFor",
    {
      name: comparisonRow ? comparisonRow.entity.code : index === 0 ? scopeName : series.name,
    },
  );
  const notice =
    !teamScoped && view.partial
      ? tr(
          view.key === "base"
            ? "graphics.knownPlanning"
            : "graphics.partialPlanning",
        )
      : "";
  const note = `${teamScoped ? tr("graphics.scopedOBRule") : `${tr("graphics.planningRule")} ${tr("graphics.periodColorsRule")}`} ${tr("graphics.weeklyRule")} ${tr("graphics.source", { source: sources || tr("common.review") })}`;
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
        exportNote={`${notice} ${note}`}
        notice={notice}
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
            sourceFor(),
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
                  <td>{sourceFor()}</td>
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
            estimated: openMonth === null ? null : i >= openMonth,
          }))}
          monthlyLabel={monthlyLabel}
          ytdLabel={cumulativeLabel}
          empty={tr(
            teamScoped
              ? "graphics.noTeam"
              : "graphics.noPlanning",
          )}
        />
      </GraphicCard>
    </div>
  );
});
