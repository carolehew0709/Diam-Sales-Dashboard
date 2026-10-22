"use client";
import { useRef } from "react";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import { ComboPlot } from "./graphic-plots";
import { useWorkbookGroup } from "./use-workbook-group";
import { months, type Dashboard } from "@/lib/dashboard";

export function SalesMonthlyGraphic({
  data,
  index = 0,
  standalone = false,
  exportOnly = false,
}: {
  data: Dashboard;
  index?: number;
  standalone?: boolean;
  exportOnly?: boolean;
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
          />
        )
      : null,
  );
  const series = data.graphics.series[index];
  const week =
    data.weeks.map((w) => `W${w}`).join(" / ") || tr("snapshot.none");
  const filters = data.filters;
  const context = `${tr("graphics.weekly", { week })} · ${filters.year} · ${display(filters.region)} · ${filters.bu === "all" ? tr("filters.allBU") : filters.bu} · ${filters.salesType === "all" ? tr("filters.allSales") : display(filters.salesType)} · ${filters.salesTeam === "all" || !filters.salesTeam ? tr("team.all") : filters.salesTeam} · kEUR`;
  const sources = [
    ...new Set(
      data.rows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])),
    ),
  ].join("; ");
  const sourceFor = (i: number) => {
    const point = series.points[i];
    return index === 0
      ? data.graphics.series
          .slice(1)
          .map((s) => {
            const p = s.points[i];
            return `${s.name}: ${p.week ? `W${p.week} · ${p.sourceFile} · ${p.sourceSheet}` : "—"}`;
          })
          .join("; ")
      : point.week
        ? `W${point.week} · ${point.sourceFile} · ${point.sourceSheet}`
        : null;
  };
  const title = tr("graphics.performanceFor", {
    name: index === 0 ? display(series.name) : series.name,
  });
  const note = `${tr("graphics.monthEndRule")} ${tr("graphics.weeklyRule")} ${tr("graphics.source", { source: sources || tr("common.review") })}`;
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
        exportTable={{
          columns: [
            { label: tr("common.month") },
            { label: `${tr("graphics.monthlySales")} (kEUR)` },
            { label: `${tr("graphics.ytdSales")} (kEUR)` },
            { label: tr("common.source") },
          ],
          rows: series.points.map((p, i) => [
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
                <th className="numeric">{tr("graphics.monthlySales")}</th>
                <th className="numeric">{tr("graphics.ytdSales")}</th>
                <th>{tr("common.source")}</th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((p, i) => (
                <tr key={i}>
                  <td>{display(months[i])}</td>
                  <td className="numeric">{exact(p.monthly)}</td>
                  <td className="numeric">{exact(p.ytd)}</td>
                  <td>{sourceFor(i) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ComboPlot
          points={series.points.map((p, i) => ({
            ...p,
            label: display(months[i]),
          }))}
          monthlyLabel={tr("graphics.monthlySales")}
          ytdLabel={tr("graphics.ytdSales")}
          empty={tr("graphics.noActuals")}
        />
      </GraphicCard>
    </div>
  );
}
