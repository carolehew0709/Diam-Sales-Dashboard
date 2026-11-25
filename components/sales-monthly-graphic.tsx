"use client";

import { memo, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import { ComboPlot } from "./graphic-plots";
import { useWorkbookGroup } from "./use-workbook-group";
import { months, type Dashboard } from "@/lib/dashboard";
import { weeklySourceReference } from "@/lib/fiscal-years";
import {
  monthlyPerformanceSeries,
  monthlySalesParts,
} from "@/lib/performance-chart";
import styles from "./sales-trend-workspace.module.css";

export const SalesMonthlyGraphic = memo(function SalesMonthlyGraphic({
  data,
  standalone = false,
  exportOnly = false,
  comparisonRow,
  compare = false,
}: {
  data: Dashboard;
  standalone?: boolean;
  exportOnly?: boolean;
  comparisonRow?: Dashboard["rows"][number];
  compare?: boolean;
}) {
  const { tr, display } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [compareEnabled, setCompareEnabled] = useState(compare);
  const availableComparison = standalone
    ? data.graphics.salesComparison
    : undefined;
  const comparison = compareEnabled ? availableComparison : undefined;
  useWorkbookGroup(
    root,
    standalone && !exportOnly
      ? () => (
          <SalesMonthlyGraphic
            data={data}
            standalone
            exportOnly
            compare={!!comparison}
          />
        )
      : null,
  );
  const selected = comparisonRow ? [comparisonRow] : data.rows;
  const metrics = comparisonRow?.metrics ?? data.totals;
  const axis = comparison
    ? undefined
    : comparisonRow
      ? data.graphics.performanceAxes.byEntity[comparisonRow.entity.id]
      : data.graphics.performanceAxes.total;
  const filters = data.filters;
  const view = monthlyPerformanceSeries(metrics, filters.scenario);
  const showProspect = !comparison && filters.scenario === "Sales + Prospect";
  const sales = tr("graphics.monthlySales");
  const cumulative = tr(
    comparison || !showProspect
      ? "graphics.cumulativeSales"
      : "graphics.cumulativeConfirmed",
  );
  const monthlyLabel = comparison ? sales + " · " + filters.year : sales;
  const ytdLabel = comparison ? cumulative + " · " + filters.year : cumulative;
  const prospectLabel = tr("graphics.monthlyProspect");
  const prior = comparison && {
    points: comparison.prior,
    monthlyLabel: sales + " · " + comparison.priorYear,
    ytdLabel: cumulative + " · " + comparison.priorYear,
  };
  const points = view.points.map((point, i) => {
    const amounts = monthlySalesParts(metrics.monthly[i]);
    return {
      label: display(months[i]),
      monthly: comparison ? comparison.current[i].monthly : amounts.sales,
      prospect: showProspect ? amounts.prospect : null,
      ytd: comparison ? comparison.current[i].ytd : point.ytd,
      estimated: null,
    };
  });
  const week =
    [
      ...new Set(
        selected.flatMap((row) =>
          row.snapshot ? ["W" + row.snapshot.week] : [],
        ),
      ),
    ].join(" / ") || tr("snapshot.none");
  const name =
    comparisonRow?.entity.code ??
    (filters.entity !== "all"
      ? (selected[0]?.entity.code ?? filters.entity)
      : filters.bu !== "all"
        ? filters.bu
        : display(filters.region));
  const salesType =
    filters.salesType === "all"
      ? tr("filters.allSales")
      : display(filters.salesType);
  const context = comparison
    ? [
        display(filters.region),
        comparison.priorYear + " / " + filters.year,
        salesType,
        tr("monthlyDetail.cutoff", {
          month: display(months[comparison.cutoffMonth - 1]),
        }),
        "kEUR",
      ].join(" · ")
    : [
        tr("graphics.weekly", { week }),
        filters.year,
        display(filters.region),
        comparisonRow?.entity.code ??
          (filters.bu === "all" ? tr("filters.allBU") : filters.bu),
        salesType,
        display(filters.scenario),
        "kEUR",
      ].join(" · ");
  const financeSource = comparison
    ? [
        comparison.sourceFile,
        comparison.sourceSheet + "!" + comparison.sourceRange,
      ].join(" · ")
    : "";
  const sourceFor = (i: number) =>
    comparison
      ? i < comparison.cutoffMonth
        ? financeSource
        : ""
      : selected
          .map(({ entity, snapshot, monthlyClose }) => {
            const source =
              monthlyClose && i < monthlyClose.monthly.length
                ? monthlyClose.sourceFile +
                  " · " +
                  monthlyClose.sourceSheet +
                  "!" +
                  monthlyClose.sourceRange
                : snapshot
                  ? weeklySourceReference(snapshot)
                  : "—";
            return entity.code + ": " + source;
          })
          .join("; ");
  const note = comparison
    ? tr("graphics.lastYearSource", { source: financeSource })
    : tr(showProspect ? "graphics.planningRule" : "graphics.salesRule") +
      " " +
      tr("graphics.weeklyRule") +
      " " +
      tr("graphics.source", {
        source:
          selected
            .flatMap((r) =>
              r.snapshot ? [weeklySourceReference(r.snapshot)] : [],
            )
            .join(" · ") || tr("common.review"),
      });
  const measures = [
    monthlyLabel,
    ...(showProspect ? [prospectLabel] : []),
    ytdLabel,
    ...(prior ? [prior.monthlyLabel, prior.ytdLabel] : []),
  ];
  return (
    <div
      ref={root}
      className={
        standalone
          ? "monthly-sales-graphic primary-sales-graphic"
          : "monthly-sales-graphic"
      }
    >
      {availableComparison && !exportOnly && (
        <div className={styles.modes}>
          <button
            type="button"
            aria-pressed={!!comparison}
            onClick={() => setCompareEnabled((on) => !on)}
          >
            {tr("graphics.compareLastYear")}
          </button>
        </div>
      )}
      <GraphicCard
        title={tr(
          comparison ? "graphics.actualByYear" : "graphics.performanceFor",
          { name },
        )}
        context={context}
        note={note}
        height={395}
        exportTable={{
          columns: [
            { label: tr("common.month") },
            ...measures.map((label) => ({ label: label + " (kEUR)" })),
            { label: tr("common.source") },
          ],
          rows: points.map((p, i) => [
            p.label,
            p.monthly,
            ...(showProspect ? [p.prospect] : []),
            p.ytd,
            ...(prior ? [prior.points[i].monthly, prior.points[i].ytd] : []),
            sourceFor(i),
          ]),
        }}
      >
        <ComboPlot
          axis={axis}
          points={points}
          monthlyLabel={monthlyLabel}
          ytdLabel={ytdLabel}
          prospectLabel={showProspect ? prospectLabel : undefined}
          previous={prior}
          showPeriodLegend={false}
          empty={tr(showProspect ? "graphics.noPlanning" : "graphics.noSales")}
        />
      </GraphicCard>
    </div>
  );
});
