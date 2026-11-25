"use client";
import { useId } from "react";
import { integerAxis } from "@/lib/chart-axis";
import { formatK } from "@/lib/dashboard";
import type { Amount } from "@/lib/types";
import { ChartMark } from "./chart-interaction";
import { useI18n } from "./i18n-provider";
import { chartAmount, salesNumber } from "@/lib/chart-tooltip";

export const graphicColors = [
  "#a77a35",
  "#262b29",
  "#6c8c7e",
  "#b6a283",
  "#718699",
  "#d0bd93",
  "#887768",
  "#bebbb2",
];
export function PlotEmpty({ text }: { text: string }) {
  return (
    <text x="400" y="175" textAnchor="middle" fill="#706f67" fontSize="16">
      {text}
    </text>
  );
}
export function PlotGrid({
  max,
  min = 0,
  ticks = integerAxis([min, max]).ticks,
  left = 70,
  right = 770,
  top = 35,
  bottom = 285,
}: {
  max: number;
  min?: number;
  ticks?: readonly number[];
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}) {
  return (
    <>
      {ticks
        .filter((value) => value >= min && value <= max)
        .map((value, i) => {
          const y = bottom - ((value - min) / (max - min)) * (bottom - top);
          return (
            <g key={i}>
              <line
                x1={left}
                x2={right}
                y1={y}
                y2={y}
                stroke="#e5e0d6"
                strokeDasharray="3 4"
              />
              <text
                x={left - 10}
                y={y + 4}
                fontSize="12"
                fill="#706f67"
                textAnchor="end"
              >
                {formatK(value)}
              </text>
            </g>
          );
        })}
      <text x={left} y="17" fill="#706f67" fontSize="11">
        kEUR
      </text>
    </>
  );
}
export function Legend({
  labels,
  y = 345,
}: {
  labels: { name: string; color: string }[];
  y?: number;
}) {
  return (
    <>
      {labels.map((l, i) => (
        <g
          key={l.name}
          transform={`translate(${70 + i * (700 / Math.max(labels.length, 1))},${y})`}
        >
          <rect width="10" height="10" y="-9" rx="2" fill={l.color} />
          <text x="16" fontSize="12" fill="#706f67">
            {l.name}
          </text>
        </g>
      ))}
    </>
  );
}

type TrendValues = { monthly: Amount; ytd: Amount };

export function ComboPlot({
  points,
  monthlyLabel,
  ytdLabel,
  empty,
  axis,
  showPeriodLegend = true,
  prospectLabel,
  previous,
}: {
  points: (TrendValues & { label: string; estimated: boolean | null; prospect?: Amount })[];
  monthlyLabel: string;
  ytdLabel: string;
  empty: string;
  axis?: ReturnType<typeof integerAxis>;
  showPeriodLegend?: boolean;
  prospectLabel?: string;
  previous?: { points: TrendValues[]; monthlyLabel: string; ytdLabel: string };
}) {
  const { locale, tr } = useI18n();
  const id = useId();
  const values = [
    ...points.flatMap((p) => [p.monthly, p.ytd, p.prospect ?? null]),
    ...(previous?.points.flatMap((p) => [p.monthly, p.ytd]) ?? []),
  ];
  if (!values.some((v) => v !== null))
    return (
      <>
        {axis && <PlotGrid min={axis.min} max={axis.max} ticks={axis.ticks} />}
        <PlotEmpty text={empty} />
      </>
    );
  const salesColor = "#d0bd93", prospectColor = "#718699";
  const currentLine = "#a77a35", priorLine = "#526d64", priorBar = "#9aada5";
  const knownPeriods = showPeriodLegend && points.some((p) => p.estimated !== null);
  const monthlyLegend = [
    ...(points.some((p) => p.monthly !== null && (!knownPeriods || p.estimated === false))
      ? [{ name: knownPeriods ? monthlyLabel + " · " + tr("graphics.earlierMonths") : monthlyLabel, color: salesColor }]
      : []),
    ...(knownPeriods && points.some((p) => p.monthly !== null && p.estimated === true)
      ? [{ name: monthlyLabel + " · " + tr("graphics.openMonths"), color: prospectColor }]
      : []),
    ...(prospectLabel && points.some((p) => p.prospect != null && p.prospect !== 0)
      ? [{ name: prospectLabel, color: prospectColor }]
      : []),
    ...(previous ? [{ name: previous.monthlyLabel, color: priorBar }] : []),
  ];
  const { max, min, ticks } = axis ?? integerAxis(values);
  const y = (v: number) => 285 - ((v - min) / (max - min)) * 250;
  const x = (i: number) => 98 + i * 58;
  const line = (series: TrendValues[]) => {
    let active = false;
    return series.map((p, i) => {
      if (p.ytd === null) {
        active = false;
        return "";
      }
      const point = (active ? "L" : "M") + x(i) + "," + y(p.ytd);
      active = true;
      return point;
    }).join(" ");
  };
  return (
    <>
      <PlotGrid max={max} min={min} ticks={ticks} />
      {previous && <path d={line(previous.points)} stroke={priorLine} strokeDasharray="5 4" strokeWidth="2" fill="none" />}
      <path d={line(points)} stroke={currentLine} strokeWidth="3" fill="none" />
      {points.map((p, i) => {
        const prior = previous?.points[i];
        const sales = p.monthly;
        const forecast = p.prospect ?? null;
        const start = forecast !== null && forecast < 0 ? Math.min(0, sales ?? 0) : Math.max(0, sales ?? 0);
        const stacked = sales !== null && forecast !== null && sales * forecast > 0;
        const combined = (sales ?? 0) + (forecast ?? 0);
        const clip = id + "-bar-" + i;
        const center = x(i);
        const hasPoint = [sales, forecast, p.ytd, prior?.monthly ?? null, prior?.ytd ?? null].some((v) => v !== null);
        const valueRow = (label: string, value: Amount) => ({ label, value: chartAmount(value, locale) });
        return (
          <g key={p.label}>
            {hasPoint && (
              <ChartMark
                color={currentLine}
                data={{
                  title: p.label,
                  subtitle: knownPeriods && p.estimated !== null
                    ? tr(p.estimated ? "graphics.openMonths" : "graphics.earlierMonths")
                    : undefined,
                  rows: [
                    valueRow(monthlyLabel, sales),
                    ...(prospectLabel ? [valueRow(prospectLabel, forecast)] : []),
                    valueRow(ytdLabel, p.ytd),
                    ...(previous && prior
                      ? [valueRow(previous.monthlyLabel, prior.monthly), valueRow(previous.ytdLabel, prior.ytd)]
                      : []),
                  ],
                }}
                hit={<rect x={center - 24} y="28" width="48" height="266" fill="white" />}
              >
                {stacked && (
                  <clipPath id={clip}>
                    <rect x={center - 15} width="30" y={Math.min(y(combined), y(0))} height={Math.abs(y(combined) - y(0))} rx="3" />
                  </clipPath>
                )}
                {prior?.monthly != null && prior.monthly !== 0 && (
                  <rect x={center + 1} width="14" y={Math.min(y(prior.monthly), y(0))} height={Math.abs(y(prior.monthly) - y(0))} rx="3" fill={priorBar} />
                )}
                {sales !== null && sales !== 0 && (
                  <rect
                    x={center - 15}
                    width={previous ? 14 : 30}
                    y={Math.min(y(sales), y(0))}
                    height={Math.abs(y(sales) - y(0))}
                    rx={stacked ? 0 : 3}
                    clipPath={stacked ? "url(#" + clip + ")" : undefined}
                    fill={knownPeriods && p.estimated ? prospectColor : salesColor}
                  />
                )}
                {forecast !== null && forecast !== 0 && (
                  <rect
                    x={center - 15}
                    width="30"
                    y={Math.min(y(start + forecast), y(start))}
                    height={Math.abs(y(start + forecast) - y(start))}
                    rx={stacked ? 0 : 3}
                    clipPath={stacked ? "url(#" + clip + ")" : undefined}
                    fill={prospectColor}
                  />
                )}
                {prior?.ytd != null && <circle cx={center} cy={y(prior.ytd)} r="3" fill="#fffefa" stroke={priorLine} strokeWidth="2" />}
                {p.ytd !== null && <circle cx={center} cy={y(p.ytd)} r="4" fill="#fffefa" stroke={currentLine} strokeWidth="2" />}
              </ChartMark>
            )}
            <text x={center} y="308" textAnchor="middle" fontSize="12" fill="#706f67">{p.label}</text>
          </g>
        );
      })}
      <Legend labels={monthlyLegend} />
      <Legend y={375} labels={[
        ...(points.some((p) => p.ytd !== null) ? [{ name: ytdLabel, color: currentLine }] : []),
        ...(previous ? [{ name: previous.ytdLabel, color: priorLine }] : []),
      ]} />
    </>
  );
}
export function DonutPlot({
  rows,
  empty,
  totalLabel,
  otherLabel,
}: {
  rows: { name: string; value: number }[];
  empty: string;
  totalLabel: string;
  otherLabel: string;
}) {
  const { tr, locale } = useI18n();
  // Keep the entire population in the denominator; the tail is explicitly grouped.
  const positive = rows.filter((r) => r.value > 0),
    shown =
      positive.length > 7
        ? [
            ...positive.slice(0, 6),
            {
              name: otherLabel,
              value: positive.slice(6).reduce((n, r) => n + r.value, 0),
            },
          ]
        : positive;
  const total = shown.reduce((n, r) => n + r.value, 0);
  if (!total || rows.some((r) => r.value < 0))
    return <PlotEmpty text={empty} />;
  let offset = 0;
  return (
    <>
      <circle
        cx="205"
        cy="167"
        r="102"
        fill="none"
        stroke="#ebe7de"
        strokeWidth="46"
      />
      {shown.map((r, i) => {
        const start = offset;
        offset += (r.value / total) * 100;
        const angle = ((start + offset) / 2 / 100) * Math.PI * 2 - Math.PI / 2;
        const data = {
          title: r.name,
          rows: [
            {
              label: tr("graphics.amount"),
              value: chartAmount(r.value, locale),
            },
            {
              label: tr("graphics.share"),
              value: salesNumber(r.value / total, locale, 0, "percent"),
            },
          ],
        };
        return (
          <ChartMark
            key={r.name}
            group={`slice-${i}`}
            data={data}
            color={graphicColors[i % graphicColors.length]}
            lift={[Math.cos(angle) * 5, Math.sin(angle) * 5]}
          >
            <circle
              key={r.name}
              cx="205"
              cy="167"
              r="102"
              fill="none"
              stroke={graphicColors[i % graphicColors.length]}
              strokeWidth="46"
              pathLength="100"
              strokeDasharray={`${(r.value / total) * 100} ${100 - (r.value / total) * 100}`}
              strokeDashoffset={-start}
              transform="rotate(-90 205 167)"
            />
          </ChartMark>
        );
      })}
      <text x="205" y="160" textAnchor="middle" fontSize="28" fontWeight="600">
        {formatK(total)}
      </text>
      <text x="205" y="185" textAnchor="middle" fill="#706f67" fontSize="12">
        {totalLabel} · kEUR
      </text>
      {shown.map((r, i) => (
        <g key={r.name} transform={`translate(380,${52 + i * 39})`}>
          <ChartMark
            group={`slice-${i}`}
            color={graphicColors[i]}
            lift={[2, 0]}
            data={{
              title: r.name,
              rows: [
                {
                  label: tr("graphics.amount"),
                  value: chartAmount(r.value, locale),
                },
                {
                  label: tr("graphics.share"),
                  value: salesNumber(r.value / total, locale, 0, "percent"),
                },
              ],
            }}
            hit={<rect x="-6" y="-8" width="390" height="32" fill="white" />}
          >
            <rect width="10" height="10" rx="2" fill={graphicColors[i]} />
            <text x="20" y="10" fontSize="13">
              {r.name.length > 30 ? r.name.slice(0, 29) + "…" : r.name}
            </text>
            <text x="374" y="10" textAnchor="end" fontSize="13">
              {formatK(r.value)} · {salesNumber(r.value / total, locale, 0, "percent")}
            </text>
          </ChartMark>
        </g>
      ))}
    </>
  );
}
