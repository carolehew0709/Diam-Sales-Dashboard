"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import { DonutPlot, Legend, graphicColors } from "./graphic-plots";
import type { Filters } from "@/lib/types";
import type { customerAnalysisView } from "@/lib/customer-analysis";
import { formatK } from "@/lib/dashboard";
import type { MessageKey } from "@/lib/i18n";
import { customerGrowth, customerMetrics } from "@/lib/customer-metrics";
import type { ChartTable } from "@/lib/chart-workbook-types";
import { useWorkbookGroup } from "./use-workbook-group";
import { ChartMark } from "./chart-interaction";
import { chartAmount } from "@/lib/chart-tooltip";
import { customerAnalysisQuery } from "@/lib/dashboard-presentation";

type View = ReturnType<typeof customerAnalysisView>;
const groupKeys: Record<string, MessageKey> = {
  "Key Customer": "graphics.keyCustomers",
  "Other Customers": "graphics.otherCustomers",
  "Intergroup D3": "graphics.intergroupD3",
  "Intergroup FR": "graphics.intergroupFR",
  "Intergroup Other Customers": "graphics.intergroupOther",
};
const statusKeys: Record<string, MessageKey> = {
  "High Growth": "graphics.highGrowth",
  "Under Review": "graphics.underReview",
  Stable: "graphics.stable",
  Outperforming: "graphics.outperforming",
};

export function CustomerGraphics({
  filters,
  revision,
}: {
  filters: Filters;
  revision: number;
}) {
  const [month, setMonth] = useState("");
  const selectedMonth = month.startsWith(`${filters.year}-`) ? month : "";
  const query = customerAnalysisQuery(filters, selectedMonth);
  const [response, setResponse] = useState<{
    query: string;
    revision: number;
    data?: View;
    error?: boolean;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/customer-analysis?${query}`, { signal: controller.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error("Customer analysis unavailable");
        if (!controller.signal.aborted)
          setResponse({ query, revision, data: j.data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResponse({ query, revision, error: true });
      });
    return () => controller.abort();
  }, [query, revision]);
  const current =
    response?.query === query && response.revision === revision
      ? response
      : undefined;
  return <CustomerGraphicsView current={current} selectedMonth={selectedMonth} setMonth={setMonth} />;
}

function CustomerGraphicsView({ current, selectedMonth, setMonth, exportOnly = false }: {
  current?: { data?: View; error?: boolean };
  selectedMonth: string;
  setMonth: (month: string) => void;
  exportOnly?: boolean;
}) {
  const { tr, locale } = useI18n();
  const root = useRef<HTMLElement>(null);
  useWorkbookGroup(root, exportOnly ? null : () => <CustomerGraphicsView current={current} selectedMonth={selectedMonth} setMonth={() => {}} exportOnly />);
  const view = current?.data,
    analysis = view?.analysis;
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${m}-01T00:00:00Z`));
  const priorLabel = analysis
    ? tr("graphics.ytdYear", { year: analysis.priorYear })
    : "";
  const currentLabel = analysis
    ? tr("graphics.ytdYear", { year: analysis.year })
    : "";
  const context = analysis
    ? `${tr("graphics.monthlySource", { month: monthLabel(analysis.month) })} · ${tr("regions.China")} (DEHK + DCP + DDC) · kEUR · ${analysis.sourceLabel}`
    : "";
  const sourceNote = analysis
    ? `${tr("graphics.customerRule")} ${tr("graphics.source", { source: `${analysis.sourceFile} · ${analysis.breakdownSheet}!A4:E11; ${analysis.customerSheet}!A4:E${(analysis.customers.at(-1)?.sourceRow ?? 4) + 1}` })}`
    : "";
  const groupLabel = (name: string) =>
    groupKeys[name] ? tr(groupKeys[name]) : name;
  const yoy = (prior: number, amount: number) => {
    const growth = customerGrowth(prior, amount);
    return growth === null
      ? "—"
      : `${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(1)}%`;
  };
  const metrics = analysis ? customerMetrics(analysis) : null;
  const metricsShare = (amount: number) => metrics && metrics.keyTotal > 0
    ? `${(amount / metrics.keyTotal * 100).toFixed(1)}%` : "—";
  const contributionTable = analysis && (
    <table className="bu-table">
      <thead>
        <tr>
          <th>{tr("common.customer")}</th>
          <th className="numeric">{currentLabel} (kEUR)</th>
          <th className="numeric">{tr("graphics.share")}</th>
        </tr>
      </thead>
      <tbody>
        {analysis.customers.map((c) => (
          <tr key={c.name}>
            <td>{c.name}</td>
            <td className="numeric">{formatK(c.current)}</td>
            <td className="numeric">{metricsShare(c.current)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const customerTable = analysis && (
    <table className="bu-table">
      <thead>
        <tr>
          <th>{tr("common.customer")}</th>
          <th className="numeric">{priorLabel}</th>
          <th className="numeric">{currentLabel}</th>
          <th className="numeric">{tr("graphics.yoy")}</th>
          <th>{tr("graphics.status")}</th>
        </tr>
      </thead>
      <tbody>
        {analysis.customers.map((c) => (
          <tr key={c.name}>
            <td>{c.name}</td>
            <td className="numeric">{formatK(c.prior)}</td>
            <td className="numeric">{formatK(c.current)}</td>
            <td className="numeric">{yoy(c.prior, c.current)}</td>
            <td>
              {statusKeys[c.status] ? tr(statusKeys[c.status]) : c.status}
            </td>
          </tr>
        ))}
        <tr>
          <td>
            <strong>{tr("graphics.keyTotal")}</strong>
          </td>
          <td className="numeric">
            {formatK(analysis.customers.reduce((n, c) => n + c.prior, 0))}
          </td>
          <td className="numeric">
            {formatK(analysis.customers.reduce((n, c) => n + c.current, 0))}
          </td>
          <td className="numeric">
            {yoy(
              analysis.customers.reduce((n, c) => n + c.prior, 0),
              analysis.customers.reduce((n, c) => n + c.current, 0),
            )}
          </td>
          <td>—</td>
        </tr>
      </tbody>
    </table>
  );
  const columns = analysis
    ? [
        tr("graphics.actualYear", { year: analysis.priorYear }),
        priorLabel,
        tr("graphics.forecastYear", { year: analysis.year }),
        currentLabel,
      ]
    : [];
  const max =
    Math.max(
      1,
      ...(analysis?.breakdown[0].values.map((_, i) =>
        analysis.breakdown.reduce((n, r) => n + r.values[i], 0),
      ) ?? []),
    ) * 1.13;
  const maxCustomer = Math.max(
    1,
    ...(analysis?.customers.flatMap((c) => [c.prior, c.current]) ?? []),
  );
  const customerExport: ChartTable | null = analysis ? {
    columns: [{ label: tr("common.customer") }, { label: `${priorLabel} (kEUR)` }, { label: `${currentLabel} (kEUR)` }, { label: tr("graphics.yoy"), format: "0.0%" }, { label: tr("graphics.status") }],
    rows: analysis.customers.map(c => [c.name, c.prior, c.current, customerGrowth(c.prior, c.current), statusKeys[c.status] ? tr(statusKeys[c.status]) : c.status]),
  } : null;
  return (
    <section
      ref={root}
      className="graphics-section customer-graphics"
      data-customer-status={!current ? "loading" : current.error ? "error" : "ready"}
      aria-labelledby={exportOnly ? undefined : "customer-graphics-title"}
    >
      <div className="graphics-section-heading">
        <div>
          <p className="panel-kicker">{tr("graphics.monthlyKicker")}</p>
          <h2 id={exportOnly ? undefined : "customer-graphics-title"}>{tr("graphics.customerTitle")}</h2>
        </div>
        {!!view?.months.length && (
          <label className="graphics-month-select">
            {tr("graphics.sourceMonth")}
            <select
              value={selectedMonth || view.months[0]}
              onChange={(e) => setMonth(e.target.value)}
            >
              {view.months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!analysis ? (
        <div className="panel graphic-unavailable" role="status">
          {!current
            ? tr("graphics.loading")
            : current.error
              ? tr("graphics.loadError")
              : !view?.permitted || !view.scopeMatches
                ? tr("graphics.customerScope")
                : tr("graphics.customerMissing")}
        </div>
      ) : (
        <>
          <p className="graphics-limitation">
            {tr("graphics.monthlySource", {
              month: monthLabel(analysis.month),
            })}{" "}
            · {tr("graphics.customerRule")}
          </p>
          <div className="graphics-customer-kpis">
            <div>
              <span>{tr("graphics.keyTotal")}</span>
              <strong>
                {formatK(metrics!.keyTotal)} <small>kEUR</small>
              </strong>
            </div>
            <div>
              <span>{tr("graphics.keyShare")}</span>
              <strong>
                {metrics!.keyShare !== null
                  ? (metrics!.keyShare * 100).toFixed(1)
                  : "—"}
                <small>%</small>
              </strong>
            </div>
            <div>
              <span>{tr("graphics.keyYoY")}</span>
              <strong>{yoy(metrics!.priorTotal, metrics!.keyTotal)}</strong>
            </div>
            <div>
              <span>{tr("graphics.sourceMonth")}</span>
              <strong className="graphics-month-value">
                {monthLabel(analysis.month)}
              </strong>
            </div>
          </div>
          <div className="graphics-grid">
            <GraphicCard
              title={tr("graphics.customerBreakdown")}
              className="graphic-wide"
              context={context}
              note={`${tr("graphics.forecastRule")} ${sourceNote}`}
              height={410}
              exportTable={{ columns: [{ label: tr("common.customer") }, ...columns.map(label => ({ label: `${label} (kEUR)` }))], rows: [...analysis.breakdown.map(r => [groupLabel(r.name), ...r.values]), [tr("graphics.total"), ...columns.map((_, i) => analysis.breakdown.reduce((n, r) => n + r.values[i], 0))]], summaryRows: [analysis.breakdown.length] }}
              table={
                <table className="bu-table">
                  <thead>
                    <tr>
                      <th>{tr("common.customer")}</th>
                      {columns.map((c) => (
                        <th className="numeric" key={c}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.breakdown.map((r) => (
                      <tr key={r.name}>
                        <td>{groupLabel(r.name)}</td>
                        {r.values.map((v, i) => (
                          <td key={i} className="numeric">
                            {formatK(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <strong>{tr("graphics.total")}</strong>
                      </td>
                      {columns.map((c, i) => (
                        <td className="numeric" key={c}>
                          {formatK(
                            analysis.breakdown.reduce(
                              (n, r) => n + r.values[i],
                              0,
                            ),
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              }
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line
                    x1="70"
                    x2="770"
                    y1={290 - f * 250}
                    y2={290 - f * 250}
                    stroke="#e5e0d6"
                    strokeDasharray="3 4"
                  />
                  <text
                    x="60"
                    y={294 - f * 250}
                    textAnchor="end"
                    fontSize="12"
                    fill="#706f67"
                  >
                    {formatK(max * f)}
                  </text>
                </g>
              ))}
              <text x="70" y="17" fill="#706f67" fontSize="11">
                kEUR
              </text>
              {columns.map((label, i) => {
                let offset = 0;
                const x = 114 + i * 166;
                const columnTotal = analysis.breakdown.reduce(
                  (n, r) => n + r.values[i],
                  0,
                );
                return (
                  <g key={label}>
                    {analysis.breakdown.map((r, j) => {
                      const value = r.values[i],
                        y = 290 - ((offset + value) / max) * 250;
                      offset += value;
                      return (
                        <ChartMark key={r.name} group={`category-${j}`} color={graphicColors[j]}
                          data={{title:groupLabel(r.name),subtitle:monthLabel(analysis.month),rows:[{label,value:chartAmount(value,locale)},{label:tr("graphics.share"),value:columnTotal>0?`${((value/columnTotal)*100).toFixed(1)}%`:"—"}]}}>
                        <rect
                          x={x}
                          y={y}
                          width="95"
                          height={(value / max) * 250}
                          fill={graphicColors[j]}
                        />
                        </ChartMark>
                      );
                    })}
                    <text
                      x={x + 47}
                      y={278 - (columnTotal / max) * 250}
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {formatK(columnTotal)}
                    </text>
                    <text x={x + 47} y="316" textAnchor="middle" fontSize="12">
                      {label}
                    </text>
                  </g>
                );
              })}
              {analysis.breakdown.map((r, i) => (
                <g
                  key={r.name}
                  transform={`translate(${70 + (i % 3) * 234},${355 + Math.floor(i / 3) * 26})`}
                >
                  <rect width="10" height="10" fill={graphicColors[i]} />
                  <text x="17" y="10" fontSize="12" fill="#706f67">
                    {groupLabel(r.name)}
                  </text>
                </g>
              ))}
            </GraphicCard>

            <GraphicCard
              title={tr("graphics.customerPie")}
              context={context}
              note={`${tr("graphics.pieRule")} ${sourceNote}`}
              height={410}
              table={contributionTable}
              exportTable={{
                columns: [
                  { label: tr("common.customer") },
                  { label: `${currentLabel} (kEUR)` },
                  { label: "%", format: "0.0%" },
                ],
                rows: analysis.customers.map((c) => [
                  c.name,
                  c.current,
                  metrics!.keyTotal > 0 ? c.current / metrics!.keyTotal : null,
                ]),
              }}
            >
              <DonutPlot
                rows={analysis.customers.map((c) => ({
                  name: c.name,
                  value: c.current,
                }))}
                empty={tr("graphics.customerMissing")}
                totalLabel={tr("graphics.keyTotal")}
                otherLabel={tr("graphics.other")}
              />
            </GraphicCard>
            <GraphicCard
              title={tr("graphics.customerYoY")}
              context={context}
              note={`${tr("graphics.yoyRule")} ${sourceNote}`}
              height={410}
              table={customerTable}
              exportTable={customerExport!}
            >
              {analysis.customers.map((c, i) => (
                <g key={c.name} transform={`translate(0,${24 + i * 52})`}>
                  <ChartMark color="#a77a35" lift={[3,0]} data={{title:c.name,subtitle:monthLabel(analysis.month),rows:[
                    {label:priorLabel,value:chartAmount(c.prior,locale)},
                    {label:currentLabel,value:chartAmount(c.current,locale)},
                    {label:tr("graphics.yoy"),value:yoy(c.prior,c.current)},
                  ]}} hit={<rect x="15" y="-2" width="770" height="42" fill="white" />}>
                  <text x="132" y="23" textAnchor="end" fontSize="13">
                    {c.name}
                  </text>
                  <rect
                    x="148"
                    width={(c.prior / maxCustomer) * 490}
                    height="16"
                    fill="#bebbb2"
                  />
                  <rect
                    x="148"
                    y="20"
                    width={(c.current / maxCustomer) * 490}
                    height="16"
                    fill="#a77a35"
                  />
                  <text
                    x="770"
                    y="23"
                    textAnchor="end"
                    fill={c.current < c.prior ? "#a34f3d" : "#2f7a5d"}
                    fontWeight="600"
                  >
                    {yoy(c.prior, c.current)}
                  </text>
                  </ChartMark>
                </g>
              ))}
              <Legend
                labels={[
                  { name: priorLabel, color: "#bebbb2" },
                  { name: currentLabel, color: "#a77a35" },
                ]}
                y={375}
              />
            </GraphicCard>
          </div>
        </>
      )}
    </section>
  );
}
