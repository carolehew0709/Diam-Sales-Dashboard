"use client";
import { useI18n } from "@/components/i18n-provider";
import type { Amount } from "@/lib/types";
import { formatK } from "@/lib/dashboard";
import { useMemo, useRef } from "react";
import { ChartDownloads } from "./graphic-card";
import { useWorkbookGroup } from "./use-workbook-group";
import type { Locale } from "@/lib/i18n";
import { ChartMark, useChartTooltip } from "./chart-interaction";
import { chartAmount } from "@/lib/chart-tooltip";
export function PerformanceChart({
  rows,
  cumulative = false,
  context = "",
  name,
  exportOnly = false,
  workbookContext,
}: {
  rows: { label: string; budget: Amount; base: Amount; scenario: Amount }[];
  cumulative?: boolean;
  context?: string;
  name?: string;
  exportOnly?: boolean;
  workbookContext?: (locale: Locale) => string;
}) {
  const { tr, display, locale } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const tooltip = useChartTooltip(svg, `${locale}:${context}:${JSON.stringify(rows)}`);
  const chartTable = useMemo(() => ({ columns: [{ label: tr("common.month") }, { label: `${tr("chart.salesOB")} (kEUR)` }, { label: `${tr("metric.scenario")} (kEUR)` }], rows: rows.map(r => [display(r.label), r.base, r.scenario]) }), [rows, locale, tr, display]);
  useWorkbookGroup(root, exportOnly ? null : () => <PerformanceChart rows={rows} cumulative={cumulative} context={context} name={name} workbookContext={workbookContext} exportOnly />);
  const values = rows
    .flatMap((r) => [r.base, r.scenario])
    .filter((v): v is number => v !== null);
  const max = Math.max(...values, 1) * 1.12;
  const x = (i: number) => 54 + (i * 640) / Math.max(rows.length - 1, 1),
    y = (v: number) => 224 - (v / max) * 194;
  const series = [
    {
      key: "base" as const,
      color: "#171813",
      label: tr("chart.salesOB"),
      dash: "",
    },
    {
      key: "scenario" as const,
      color: "#a77a35",
      label: tr("metric.scenario"),
      dash: "",
    },
  ];
  return (
    <div className="apac-chart" ref={root}>
      <svg
        ref={svg}
        fontFamily="Arial, 'Microsoft YaHei', sans-serif"
        viewBox="0 0 720 293"
        role="group"
        aria-label={
          cumulative ? tr("chart.cumulativeA11y") : tr("chart.monthlyA11y")
        }
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1="54"
              x2="700"
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e8e3d9"
              strokeDasharray="3 4"
            />
            <text
              x="46"
              y={y(max * f) + 4}
              textAnchor="end"
              fill="#929087"
              fontSize="10"
            >
              {formatK(max * f)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          let d = "";
          let active = false;
          rows.forEach((r, i) => {
            const v = r[s.key];
            if (v === null) {
              active = false;
              return;
            }
            d += `${active ? "L" : "M"} ${x(i)} ${y(v)} `;
            active = true;
          });
          return (
            <g key={s.key}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeDasharray={s.dash}
              />
              {rows.map((r, i) =>
                r[s.key] === null ? null : (
                  <ChartMark key={i} group={`month-${i}`} color={s.color}
                    data={{title:display(r.label),rows:series.map(item=>({label:item.label,value:chartAmount(r[item.key],locale)}))}}
                    hit={<circle cx={x(i)} cy={y(r[s.key]!)} r="10" fill="white" />}>
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(r[s.key]!)}
                    r="3.5"
                    fill="white"
                    stroke={s.color}
                  />
                  </ChartMark>
                ),
              )}
            </g>
          );
        })}
        {rows.map((r, i) => (
          <text
            key={r.label}
            x={x(i)}
            y="249"
            textAnchor="middle"
            fill="#706f67"
            fontSize="10"
          >
            {display(r.label)}
          </text>
        ))}
        {series.map((s, i) => <g key={s.key} transform={`translate(${54 + i * 215},280)`}>
          <line x1="0" x2="16" y1="-4" y2="-4" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash} />
          <text x="22" fontSize="10" fill="#706f67">{s.label}</text>
        </g>)}
      </svg>
      {tooltip}
      {!values.length && (
        <div className="chart-empty">
          {tr("chart.empty")}
        </div>
      )}
      <div className="apac-legend">
        <small className="chart-note">{tr("chart.gaps")}</small>
      </div>
      <ChartDownloads svg={svg} title={cumulative ? tr("chart.cumulativeTitle") : tr("chart.monthlyTitle")} context={exportOnly && workbookContext ? workbookContext(locale) : context} sheetName={name ? `${name} · ${tr("chart.cumulativeTitle")}` : undefined}
        exportTable={chartTable}
        note={`${tr("chart.salesOB")} · ${tr("metric.scenario")} · ${tr("chart.gaps")}`} />
    </div>
  );
}
