"use client";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import {
  DonutPlot,
  Legend,
  PlotEmpty,
  PlotGrid,
  graphicColors,
} from "./graphic-plots";
import { formatK, months, percent, type Dashboard } from "@/lib/dashboard";
import { ChartWorkbookExport } from "./chart-workbook-export";
import type { ChartTable } from "@/lib/chart-workbook-types";
import { useRef, useState } from "react";
import { useWorkbookGroup } from "./use-workbook-group";
import { ChartMark } from "./chart-interaction";
import { chartAmount } from "@/lib/chart-tooltip";
import { SalesMonthlyGraphic } from "./sales-monthly-graphic";
import { businessUnitShares } from "@/lib/sales-graphics";

export function SalesGraphics({
  data,
  exportOnly = false,
}: {
  data: Dashboard;
  exportOnly?: boolean;
}) {
  const { tr, display, locale } = useI18n();
  const root = useRef<HTMLElement>(null);
  useWorkbookGroup(
    root,
    exportOnly ? null : () => <SalesGraphics data={data} exportOnly />,
  );
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
  return (
    <section
      ref={root}
      className="graphics-section"
      aria-labelledby={exportOnly ? undefined : "sales-graphics-title"}
    >
      <details className="graphics-entity-details">
        <summary>{tr("graphics.entityCharts")}</summary>
        <div className="graphics-grid">
          {data.graphics.series.slice(1).map((series, i) => (
            <SalesMonthlyGraphic key={series.id} data={data} index={i + 1} />
          ))}
        </div>
      </details>
      <div className="graphics-section-heading">
        <div>
          <p className="panel-kicker">{tr("graphics.weeklyKicker")}</p>
          <h2 id={exportOnly ? undefined : "sales-graphics-title"}>
            {tr("graphics.salesTitle")}
          </h2>
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
          exportTable={{
            columns: [
              { label: tr("graphics.workbookStep") },
              { label: "kEUR" },
            ],
            rows: bars.map((b) => [b.name, b.value]),
            summaryRows: [bars.length - 1],
          }}
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
                  <ChartMark
                    key={i}
                    color={b.color}
                    data={{
                      title: b.name,
                      subtitle: week,
                      rows: [
                        {
                          label: tr("graphics.amount"),
                          value: chartAmount(b.value, locale),
                        },
                      ],
                    }}
                  >
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

        <InvoiceProgress data={data} />
      </div>

      <p className="graphics-limitation">{tr("graphics.missingYoY")}</p>
    </section>
  );
}

export function TeamContributionGraphic({
  data,
  exportOnly = false,
  selectedTeam = "all",
}: {
  data: Dashboard;
  exportOnly?: boolean;
  selectedTeam?: string;
}) {
  const { tr, display, locale } = useI18n();
  const [requestedTeam, setTeam] = useState(selectedTeam);
  const team = data.graphics.teams.some((row) => row.name === requestedTeam)
    ? requestedTeam
    : "all";
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(
    root,
    exportOnly
      ? null
      : () => <TeamContributionGraphic data={data} selectedTeam={team} exportOnly />,
  );
  const week =
    data.weeks.map((w) => `W${w}`).join(" / ") || tr("snapshot.none");
  const context = `${tr("graphics.weekly", { week })} · ${data.filters.year} · ${display(data.filters.region)} · ${data.filters.bu === "all" ? tr("filters.allBU") : data.filters.bu} · ${data.filters.salesType === "all" ? tr("filters.allSales") : display(data.filters.salesType)} · ${team === "all" ? tr("team.all") : team === "__unassigned__" ? tr("team.unassigned") : team} · kEUR`;
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
  const teams = data.graphics.teams.filter((row) => team === "all" || row.name === team);
  const teamTotal = teams.reduce((n, r) => n + r.value, 0);
  const teamRows = teams.map((r) => ({
    ...r,
    name: r.name === "__unassigned__" ? tr("team.unassigned") : r.name,
  }));
  const teamBUs = (row: (typeof teamRows)[number]) =>
    row.entityIds
      .map((id) => data.entities.find((e) => e.id === id)?.code ?? id)
      .join(" / ");
  const detailMonths = months
    .map((label, index) => ({ label, index }))
    .filter(({ index }) => teamRows.some((row) => row.monthly[index] !== 0));
  return (
    <div ref={root} className="team-contribution-graphic">
      {!exportOnly && (
        <label className="commercial-filter team-local-filter" htmlFor="sales-team">
          <span>{tr("team.label")}</span>
          <select
            id="sales-team"
            value={team}
            onChange={(event) => setTeam(event.target.value)}
          >
            <option value="all">{tr("team.all")}</option>
            {data.graphics.teams.map((row) => (
              <option key={row.name} value={row.name}>
                {row.name === "__unassigned__" ? tr("team.unassigned") : row.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <GraphicCard
        title={tr("graphics.teamContribution")}
        context={context}
        note={`${tr("graphics.teamRule")} ${note}`}
        notice={tr("team.localScope")}
        exportTable={{
          columns: [
            { label: tr("team.label") },
            { label: "kEUR" },
            { label: "%", format: "0.0%" },
            ...months.map((month) => ({ label: `${display(month)} (kEUR)` })),
            { label: tr("common.buEntity") },
            { label: tr("team.orderLines") },
            { label: tr("common.source") },
          ],
          rows: teamRows.map((r) => [
            r.name,
            r.value,
            teamTotal > 0 ? r.value / teamTotal : null,
            ...r.monthly,
            teamBUs(r),
            r.lineCount,
            r.source,
          ]),
        }}
        table={
          <table className="bu-table">
            <thead>
              <tr>
                <th>{tr("team.label")}</th>
                <th className="numeric">kEUR</th>
                <th className="numeric">%</th>
                {detailMonths.map(({ label, index }) => (
                  <th className="numeric" key={index}>
                    {display(label)}
                  </th>
                ))}
                <th>{tr("common.buEntity")}</th>
                <th className="numeric">{tr("team.orderLines")}</th>
                <th>{tr("common.source")}</th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="numeric">{exact(r.value)}</td>
                  <td className="numeric">
                    {teamTotal > 0
                      ? `${((r.value / teamTotal) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  {detailMonths.map(({ index }) => (
                    <td className="numeric" key={index}>
                      {exact(r.monthly[index])}
                    </td>
                  ))}
                  <td>{teamBUs(r)}</td>
                  <td className="numeric">{r.lineCount}</td>
                  <td>{r.source}</td>
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
  );
}

function InvoiceProgress({ data }: { data: Dashboard }) {
  const { tr, display } = useI18n();
  const t = data.totals;
  return (
    <article className="panel invoice-progress-card">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("chart.control")}</p>
          <h2>{tr("chart.invoice")}</h2>
          <p>
            {[
              ...new Set(
                data.rows.flatMap((r) =>
                  r.snapshot && r.metrics.monthEstimate !== null
                    ? [display(months[r.snapshot.month - 1])]
                    : [],
                ),
              ),
            ].join(" / ")}{" "}
            {tr("chart.sourceMonth")}
          </p>
        </div>
      </div>
      <div className="apac-delivery">
        <strong>
          {formatK(t.monthSales)}
          <small>{tr("chart.mtd")}</small>
        </strong>
        <span>
          {tr("notes.estimate", { amount: formatK(t.monthEstimate) })}
        </span>
        <div className="delivery-track">
          <i
            style={{
              width: `${t.monthEstimate ? Math.min(100, ((t.monthSales ?? 0) / t.monthEstimate) * 100) : 0}%`,
            }}
          />
        </div>
        <p>
          {tr("chart.stillInvoice")}
          <b>{formatK(t.remaining)} kEUR</b>
        </p>
      </div>
      <div className="panel-foot">
        <span>{tr("chart.monthNote")}</span>
        <span className="source-note">{tr("chart.partialMonth")}</span>
      </div>
    </article>
  );
}

export function BusinessUnitGraphics({
  data,
  exportOnly = false,
}: {
  data: Dashboard;
  exportOnly?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(
    root,
    exportOnly ? null : () => <BusinessUnitGraphics data={data} exportOnly />,
  );
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
  const shares = businessUnitShares(rows.map((r) => r.metrics.base));
  const shareLabel = (value: number | null) =>
    value === null
      ? "—"
      : new Intl.NumberFormat(locale, {
          style: "percent",
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(value);
  const table = (
    <table className="bu-table">
      <thead>
        <tr>
          <th>{tr("common.buEntity")}</th>
          <th className="numeric">{tr("graphics.annualBudget")}</th>
          <th className="numeric">{tr("graphics.invoiced")}</th>
          <th className="numeric">{tr("metric.ob")}</th>
          <th className="numeric">{tr("graphics.annualBase")}</th>
          <th className="numeric">{tr("graphics.buShare")}</th>
          <th className="numeric">{tr("metric.coverage")}</th>
          <th className="numeric">{tr("metric.gap")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.entity.id}>
            <td>{r.entity.code}</td>
            <td className="numeric">{formatK(r.metrics.budget)}</td>
            <td className="numeric">{formatK(r.metrics.sales)}</td>
            <td className="numeric">{formatK(r.metrics.orderbook)}</td>
            <td className="numeric">{formatK(r.metrics.base)}</td>
            <td className="numeric">{shareLabel(shares[i])}</td>
            <td className="numeric">{display(percent(r.metrics.coverage))}</td>
            <td className="numeric">{formatK(r.metrics.gap)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const exportTable: ChartTable = {
    columns: [
      { label: tr("common.buEntity") },
      { label: `${tr("graphics.annualBudget")} (kEUR)` },
      { label: `${tr("graphics.invoiced")} (kEUR)` },
      { label: `${tr("metric.ob")} (kEUR)` },
      { label: `${tr("graphics.annualBase")} (kEUR)` },
      { label: tr("graphics.buShare"), format: "0.0%" },
      { label: tr("metric.coverage"), format: "0.0%" },
      { label: `${tr("metric.gap")} (kEUR)` },
      { label: tr("common.source") },
    ],
    rows: rows.map((r, i) => [
      r.entity.code,
      r.metrics.budget,
      r.metrics.sales,
      r.metrics.orderbook,
      r.metrics.base,
      shares[i],
      r.metrics.coverage,
      r.metrics.gap,
      r.snapshot
        ? `W${r.snapshot.week} · ${r.snapshot.sourceFile} · ${r.snapshot.sourceSheet}`
        : null,
    ]),
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
            <ChartMark
              color={graphicColors[i]}
              lift={[3, 0]}
              data={{
                title: r.entity.code,
                rows: [
                  {
                    label: tr("graphics.annualBase"),
                    value: chartAmount(r.metrics.base, locale),
                  },
                  {
                    label: tr("graphics.buShare"),
                    value: shareLabel(shares[i]),
                  },
                  {
                    label: tr("graphics.annualBudget"),
                    value: chartAmount(r.metrics.budget, locale),
                  },
                  {
                    label: tr("metric.coverage"),
                    value: percent(r.metrics.coverage),
                  },
                  {
                    label: tr("metric.gap"),
                    value: chartAmount(r.metrics.gap, locale),
                  },
                ],
              }}
              hit={<rect x="20" y="-8" width="760" height="44" fill="white" />}
            >
              <text x="28" y="19">
                {r.entity.code}
              </text>
              <rect x="100" width="470" height="28" rx="4" fill="#f0ece4" />
              {r.metrics.base !== null && r.metrics.base >= 0 && (
                <rect
                  x="100"
                  width={(r.metrics.base / max) * 470}
                  height="28"
                  rx="4"
                  fill={graphicColors[i]}
                />
              )}
              <text x="690" y="19" textAnchor="end">
                {formatK(r.metrics.base)} kEUR
              </text>
              <text
                x="770"
                y="19"
                textAnchor="end"
                fontWeight="600"
                fill="#a77a35"
              >
                {shareLabel(shares[i])}
              </text>
            </ChartMark>
          </g>
        ))}
      </GraphicCard>
      <SalesMixGraphic data={data} context={context} sourceNote={sourceNote} />
    </div>
  );
}

function SalesMixGraphic({
  data,
  context,
  sourceNote,
}: {
  data: Dashboard;
  context: string;
  sourceNote: string;
}) {
  const { tr } = useI18n();
  const rows = [
    ...(data.filters.salesType !== "group"
      ? [{ name: tr("common.external"), value: data.external }]
      : []),
    ...(data.filters.salesType !== "external"
      ? [{ name: tr("common.group"), value: data.group }]
      : []),
  ];
  return (
    <GraphicCard
      title={tr("chart.externalGroup")}
      context={context}
      note={`${tr("graphics.mixRule")} ${sourceNote}`}
      exportTable={{
        columns: [{ label: tr("filters.type") }, { label: "kEUR" }],
        rows: rows.map((r) => [r.name, r.value]),
      }}
    >
      <DonutPlot
        rows={rows.flatMap((r) =>
          r.value === null ? [] : [{ name: r.name, value: r.value }],
        )}
        empty={tr("graphics.incompleteAnnual")}
        totalLabel={tr("graphics.annualBase")}
        otherLabel={tr("graphics.other")}
      />
    </GraphicCard>
  );
}
