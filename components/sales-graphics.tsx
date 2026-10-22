"use client";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import {
  ComboPlot,
  DonutPlot,
  Legend,
  PlotEmpty,
  PlotGrid,
  graphicColors,
} from "./graphic-plots";
import { formatK, months, percent, type Dashboard } from "@/lib/dashboard";
import { ChartWorkbookExport } from "./chart-workbook-export";
import type { ChartTable } from "@/lib/chart-workbook-types";
import { useRef } from "react";
import { useWorkbookGroup } from "./use-workbook-group";
import { ChartMark } from "./chart-interaction";
import { chartAmount } from "@/lib/chart-tooltip";

export function SalesGraphics({ data, exportOnly = false }: { data: Dashboard; exportOnly?: boolean }) {
  const { tr, display, locale } = useI18n();
  const root = useRef<HTMLElement>(null);
  useWorkbookGroup(root, exportOnly ? null : () => <SalesGraphics data={data} exportOnly />);
  const t = data.totals;
  const week =
    data.weeks.map((w) => `W${w}`).join(" / ") || tr("snapshot.none");
  const context = `${tr("graphics.weekly", { week })} · ${data.filters.year} · ${display(data.filters.region)} · ${data.filters.bu === "all" ? tr("filters.allBU") : data.filters.bu} · ${data.filters.salesType === "all" ? tr("filters.allSales") : display(data.filters.salesType)} · ${data.filters.salesTeam === "all" || !data.filters.salesTeam ? tr("team.all") : data.filters.salesTeam} · kEUR`;
  const sources = [
    ...new Set(
      data.rows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])),
    ),
  ].join("; ");
  const note = `${tr("graphics.weeklyRule")} ${tr("graphics.source", { source: sources || tr("common.review") })}`;
  const exact = (v: number | null) =>
    v === null
      ? "—"
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const baseReady =
    data.rows.length > 0 &&
    data.rows.every(
      (r) =>
        r.metrics.sales !== null &&
        r.metrics.orderbook !== null &&
        r.metrics.base !== null,
    );
  const budgetReady = baseReady && t.budgetComparable && t.budget !== null;
  const provisional =
    t.budget !== null && !t.budgetComplete
      ? tr("notes.provisionalBudgetCalculation")
      : "";
  const adjustment = baseReady ? t.base! - t.sales! - t.orderbook! : 0;
  const bars = [
    {
      name: tr("graphics.annualBudget"),
      value: t.budget,
      start: 0,
      color: "#b8b5ad",
    },
    {
      name: tr("graphics.invoiced"),
      value: t.sales,
      start: 0,
      color: "#262b29",
    },
    {
      name: tr("metric.ob"),
      value: t.orderbook,
      start: t.sales ?? 0,
      color: "#d0bd93",
    },
    ...(Math.abs(adjustment) > 0.001
      ? [
          {
            name: tr("graphics.adjustment"),
            value: adjustment,
            start: (t.sales ?? 0) + (t.orderbook ?? 0),
            color: "#718699",
          },
        ]
      : []),
    {
      name: tr("graphics.annualBase"),
      value: t.base,
      start: 0,
      color: "#a77a35",
    },
  ];
  const waterfallMax =
    Math.max(
      1,
      ...bars.map((b) => Math.max(b.start, b.start + (b.value ?? 0))),
    ) * 1.18;
  const waterfallMin =
    Math.min(
      0,
      ...bars.map((b) => Math.min(b.start, b.start + (b.value ?? 0))),
    ) * 1.18;
  const wy = (v: number) =>
    280 - ((v - waterfallMin) / (waterfallMax - waterfallMin)) * 245;
  const coverage = t.coverage;
  const monthlyTable = (index: number) => (
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
        {data.graphics.series[index].points.map((p, i) => (
          <tr key={i}>
            <td>{display(months[i])}</td>
            <td className="numeric">{exact(p.monthly)}</td>
            <td className="numeric">{exact(p.ytd)}</td>
            <td>
              {index === 0
                ? data.graphics.series
                    .slice(1)
                    .map((s) => {
                      const x = s.points[i];
                      return x.week
                        ? `${s.name}: W${x.week} · ${x.sourceFile} · ${x.sourceSheet}`
                        : `${s.name}: —`;
                    })
                    .join("; ")
                : p.week
                  ? `W${p.week} · ${p.sourceFile} · ${p.sourceSheet}`
                  : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const seriesCard = (index: number) => {
    const s = data.graphics.series[index];
    const title = tr("graphics.performanceFor", {
      name: index === 0 ? display(s.name) : s.name,
    });
    return (
      <GraphicCard
        key={s.id}
        title={title}
        context={context}
        note={`${tr("graphics.monthEndRule")} ${note}`}
        table={monthlyTable(index)}
        exportTable={{
          columns: [{ label: tr("common.month") }, { label: `${tr("graphics.monthlySales")} (kEUR)` }, { label: `${tr("graphics.ytdSales")} (kEUR)` }, { label: tr("common.source") }],
          rows: s.points.map((p, i) => [display(months[i]), p.monthly, p.ytd,
            index === 0 ? data.graphics.series.slice(1).map(b => { const x = b.points[i]; return `${b.name}: ${x.week ? `W${x.week} · ${x.sourceFile} · ${x.sourceSheet}` : "—"}`; }).join("; ") : p.week ? `W${p.week} · ${p.sourceFile} · ${p.sourceSheet}` : null]),
        }}
      >
        <ComboPlot
          points={s.points.map((p, i) => ({ ...p, label: display(months[i]) }))}
          monthlyLabel={tr("graphics.monthlySales")}
          ytdLabel={tr("graphics.ytdSales")}
          empty={tr("graphics.noActuals")}
        />
      </GraphicCard>
    );
  };
  const teams = data.graphics.teams;
  const teamTotal = teams.reduce((n, r) => n + r.value, 0);
  const teamRows = teams.map((r) => ({
    ...r,
    name: r.name === "__unassigned__" ? tr("team.unassigned") : r.name,
  }));
  return (
    <section
      ref={root}
      className="graphics-section"
      aria-labelledby={exportOnly ? undefined : "sales-graphics-title"}
    >
      <div className="graphics-section-heading">
        <div>
          <p className="panel-kicker">{tr("graphics.weeklyKicker")}</p>
          <h2 id={exportOnly ? undefined : "sales-graphics-title"}>{tr("graphics.salesTitle")}</h2>
        </div>
        <span className="graphics-period">
          {tr("graphics.weekly", { week })}
        </span>
      </div>
      {!exportOnly && <ChartWorkbookExport />}
      <div className="graphics-grid">
        <GraphicCard
          title={tr("graphics.waterfall")}
          context={context}
          note={`${tr("graphics.noProspect")} ${provisional} ${note}`}
          exportTable={{ columns: [{ label: tr("graphics.workbookStep") }, { label: "kEUR" }], rows: bars.map(b => [b.name, b.value]), summaryRows: [bars.length - 1] }}
        >
          {!budgetReady ? (
            <PlotEmpty text={tr("graphics.incompleteAnnual")} />
          ) : (
            <>
              <PlotGrid max={waterfallMax} min={waterfallMin} bottom={280} />
              <line
                x1="70"
                x2="770"
                y1={wy(t.budget!)}
                y2={wy(t.budget!)}
                stroke="#9e563f"
                strokeDasharray="6 4"
              />
              {bars.map((b, i) => {
                const x = 94 + i * (650 / bars.length),
                  end = b.start + b.value!;
                return (
                  <ChartMark key={i} color={b.color} data={{title:b.name,subtitle:week,rows:[{label:tr("graphics.amount"),value:chartAmount(b.value,locale)}]}}>
                    <rect
                      x={x}
                      y={Math.min(wy(end), wy(b.start))}
                      width={Math.min(100, 510 / bars.length)}
                      height={Math.max(1, Math.abs(wy(b.start) - wy(end)))}
                      fill={b.color}
                      rx="2"
                    />
                    <text
                      x={x + Math.min(100, 510 / bars.length) / 2}
                      y={Math.min(wy(end), wy(b.start)) - 10}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="600"
                    >
                      {formatK(b.value)}
                    </text>
                    <text
                      x={x + Math.min(100, 510 / bars.length) / 2}
                      y="307"
                      textAnchor="middle"
                      fontSize="12"
                    >
                      {b.name}
                    </text>
                  </ChartMark>
                );
              })}
              <Legend
                labels={[
                  { name: tr("graphics.annualBudget"), color: "#9e563f" },
                ]}
              />
            </>
          )}
        </GraphicCard>
        <GraphicCard
          title={tr("graphics.gauge")}
          context={context}
          note={`${tr("graphics.noProspect")} ${provisional} ${note}`}
          exportTable={{ columns: [{ label: tr("graphics.workbookStep") }, { label: "kEUR" }, { label: tr("metric.coverage"), format: "0.0%" }], rows: [
            [tr("graphics.annualBudget"), t.budget, null], [tr("graphics.invoiced"), t.sales, null], [tr("metric.ob"), t.orderbook, null],
            [tr("graphics.annualBase"), t.base, t.coverage], [tr("metric.gap"), t.gap, null],
          ], summaryRows: [3] }}
        >
          {coverage === null ? (
            <PlotEmpty text={tr("graphics.incompleteAnnual")} />
          ) : (
            <ChartMark hit={<rect x="175" y="15" width="450" height="320" fill="white" />} data={{title:tr("graphics.gauge"),subtitle:week,rows:[
              {label:tr("graphics.annualBudget"),value:chartAmount(t.budget,locale)},
              {label:tr("graphics.annualBase"),value:chartAmount(t.base,locale)},
              {label:tr("metric.coverage"),value:`${(coverage*100).toFixed(1)}%`},
              {label:tr("metric.gap"),value:chartAmount(t.gap,locale)},
            ]}}>
              <path
                d="M 220 240 A 180 180 0 0 1 580 240"
                fill="none"
                stroke="#ebe7de"
                strokeWidth="36"
              />
              <path
                d="M 220 240 A 180 180 0 0 1 580 240"
                fill="none"
                stroke="#a77a35"
                strokeWidth="36"
                pathLength="100"
                strokeDasharray={`${Math.min(100, Math.max(0, (coverage / 1.5) * 100))} 100`}
              />
              {[0, 0.5, 1, 1.5].map((v) => {
                const angle = Math.PI - (v / 1.5) * Math.PI;
                return (
                  <text
                    key={v}
                    x={400 + 224 * Math.cos(angle)}
                    y={240 - 224 * Math.sin(angle)}
                    textAnchor="middle"
                    fill="#706f67"
                  >
                    {Math.round(v * 100)}%
                  </text>
                );
              })}
              <text
                x="400"
                y="188"
                textAnchor="middle"
                fontSize="46"
                fontWeight="600"
              >
                {(coverage * 100).toFixed(1)}%
              </text>
              <text x="400" y="219" textAnchor="middle" fill="#706f67">
                {tr("graphics.annualBase")}
              </text>
              <text x="400" y="285" textAnchor="middle" fontSize="15">
                {tr("metric.gap")}: {formatK(t.gap)} kEUR
              </text>
              <text x="400" y="319" textAnchor="middle" fill="#706f67">
                {tr("graphics.annualBudget")}: {formatK(t.budget)} ·{" "}
                {tr("graphics.annualBase")}: {formatK(t.base)}
              </text>
            </ChartMark>
          )}
        </GraphicCard>
        {seriesCard(0)}
        <GraphicCard
          title={tr("graphics.teamContribution")}
          context={context}
          note={`${tr("graphics.teamRule")} ${note}`}
          exportTable={{ columns: [{ label: tr("team.label") }, { label: "kEUR" }, { label: "%", format: "0.0%" }], rows: teamRows.map(r => [r.name, r.value, teamTotal > 0 ? r.value / teamTotal : null]) }}
          table={
            <table className="bu-table">
              <thead>
                <tr>
                  <th>{tr("team.label")}</th>
                  <th className="numeric">kEUR</th>
                  <th className="numeric">%</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="numeric">{exact(r.value)}</td>
                    <td className="numeric">
                      {teamTotal > 0
                        ? ((r.value / teamTotal) * 100).toFixed(1)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <DonutPlot
            rows={teamRows}
            empty={tr("graphics.noTeam")}
            totalLabel={tr("metric.ob")}
            otherLabel={tr("graphics.other")}
          />
        </GraphicCard>
      </div>
      <details className="graphics-entity-details">
        <summary>{tr("graphics.entityCharts")}</summary>
        <div className="graphics-grid">
          {data.graphics.series.slice(1).map((_, i) => seriesCard(i + 1))}
        </div>
      </details>
      <p className="graphics-limitation">{tr("graphics.missingYoY")}</p>
    </section>
  );
}

export function BusinessUnitGraphics({ data, exportOnly = false }: { data: Dashboard; exportOnly?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(root, exportOnly ? null : () => <BusinessUnitGraphics data={data} exportOnly />);
  const { tr, display, locale } = useI18n();
  const rows = data.rows;
  const context = `${data.filters.year} · ${display(data.filters.region)} · ${data.filters.bu === "all" ? tr("filters.allBU") : data.filters.bu} · ${data.filters.salesType === "all" ? tr("filters.allSales") : display(data.filters.salesType)} · ${data.filters.salesTeam === "all" || !data.filters.salesTeam ? tr("team.all") : data.filters.salesTeam} · ${data.weeks.map((w) => `W${w}`).join(" / ")} · kEUR`;
  const sourceNote = tr("graphics.source", {
    source:
      [
        ...new Set(
          data.rows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])),
        ),
      ].join("; ") || tr("common.review"),
  });
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.metrics.base ?? 0)));
  const budgetTotal = rows.reduce(
    (n, r) => n + Math.max(0, r.metrics.budget ?? 0),
    0,
  );
  let offset = 40;
  const table = (
    <table className="bu-table">
      <thead>
        <tr>
          <th>{tr("common.buEntity")}</th>
          <th className="numeric">{tr("graphics.annualBudget")}</th>
          <th className="numeric">{tr("graphics.annualBase")}</th>
          <th className="numeric">{tr("metric.coverage")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.entity.id}>
            <td>{r.entity.code}</td>
            <td className="numeric">{formatK(r.metrics.budget)}</td>
            <td className="numeric">{formatK(r.metrics.base)}</td>
            <td className="numeric">{display(percent(r.metrics.coverage))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const exportTable: ChartTable = {
    columns: [{ label: tr("common.buEntity") }, { label: `${tr("graphics.annualBudget")} (kEUR)` }, { label: `${tr("graphics.annualBase")} (kEUR)` }, { label: tr("metric.coverage"), format: "0.0%" }, { label: tr("common.source") }],
    rows: rows.map(r => [r.entity.code, r.metrics.budget, r.metrics.base, r.metrics.coverage, r.snapshot ? `W${r.snapshot.week} · ${r.snapshot.sourceFile} · ${r.snapshot.sourceSheet}` : null]),
  };
  return (
    <div className="graphics-grid bu-graphics" ref={root}>
      <GraphicCard
        title={tr("graphics.buContribution")}
        context={context}
        note={`${tr("graphics.buRule")} ${sourceNote}`}
        table={table}
        exportTable={exportTable}
        height={Math.max(300, rows.length * 52 + 60)}
      >
        {rows.map((r, i) => (
          <g key={r.entity.id} transform={`translate(0,${35 + i * 50})`}>
            <ChartMark color={graphicColors[i]} lift={[3,0]} data={{title:r.entity.code,rows:[
              {label:tr("graphics.annualBase"),value:chartAmount(r.metrics.base,locale)},
              {label:tr("graphics.annualBudget"),value:chartAmount(r.metrics.budget,locale)},
              {label:tr("metric.coverage"),value:percent(r.metrics.coverage)},
            ]}} hit={<rect x="20" y="-8" width="760" height="44" fill="white" />}>
            <text x="28" y="19">
              {r.entity.code}
            </text>
            <rect x="100" width="510" height="28" rx="4" fill="#f0ece4" />
            {r.metrics.base !== null && r.metrics.base >= 0 && (
              <rect
                x="100"
                width={(r.metrics.base / max) * 510}
                height="28"
                rx="4"
                fill={graphicColors[i]}
              />
            )}
            <text x="770" y="19" textAnchor="end">
              {formatK(r.metrics.base)} kEUR
            </text>
            </ChartMark>
          </g>
        ))}
      </GraphicCard>
      <GraphicCard
        title={tr("graphics.treemap")}
        context={context}
        note={`${tr("graphics.treemapRule")} ${sourceNote}`}
        table={table}
        exportTable={exportTable}
      >
        {budgetTotal <= 0 ? (
          <PlotEmpty text={tr("graphics.incompleteAnnual")} />
        ) : (
          rows
            .filter((r) => (r.metrics.budget ?? 0) > 0)
            .map((r, i) => {
              const width = (r.metrics.budget! / budgetTotal) * 720,
                x = offset;
              offset += width;
              return (
                <ChartMark key={r.entity.id} color={graphicColors[i]} data={{title:r.entity.code,rows:[
                  {label:tr("graphics.annualBudget"),value:chartAmount(r.metrics.budget,locale)},
                  {label:tr("graphics.annualBase"),value:chartAmount(r.metrics.base,locale)},
                  {label:tr("metric.coverage"),value:percent(r.metrics.coverage)},
                ]}}>
                  <rect
                    x={x}
                    y="35"
                    width={Math.max(0, width - 3)}
                    height="210"
                    rx="5"
                    fill={graphicColors[i]}
                  />
                  <text
                    x={x + width / 2}
                    y="110"
                    fill="white"
                    textAnchor="middle"
                    fontSize={width < 85 ? 12 : 21}
                    fontWeight="600"
                  >
                    {r.entity.code}
                  </text>
                  <text
                    x={x + width / 2}
                    y="145"
                    fill="white"
                    textAnchor="middle"
                    fontSize={width < 85 ? 11 : 25}
                  >
                    {r.metrics.coverage === null
                      ? "—"
                      : `${(r.metrics.coverage * 100).toFixed(0)}%`}
                  </text>
                </ChartMark>
              );
            })
        )}
        <text x="40" y="291" fill="#706f67" fontSize="12">
          {tr("graphics.excludedTiles", {
            entities:
              rows
                .filter((r) => !(r.metrics.budget! > 0))
                .map((r) => r.entity.code)
                .join(", ") || "—",
          })}
        </text>
      </GraphicCard>
    </div>
  );
}
