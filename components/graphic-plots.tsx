"use client";
import { formatK } from "@/lib/dashboard";
import type { Amount } from "@/lib/types";

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
  left = 70,
  right = 770,
  top = 35,
  bottom = 285,
}: {
  max: number;
  min?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}) {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => {
        const value = min + ((max - min) * i) / 4,
          y = bottom - (i * (bottom - top)) / 4;
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
export function ComboPlot({
  points,
  monthlyLabel,
  ytdLabel,
  empty,
}: {
  points: { label: string; monthly: Amount; ytd: Amount }[];
  monthlyLabel: string;
  ytdLabel: string;
  empty: string;
}) {
  const values = points
    .flatMap((p) => [p.monthly, p.ytd])
    .filter((v): v is number => v !== null);
  if (!values.length) return <PlotEmpty text={empty} />;
  const max = Math.max(...values, 1) * 1.13,
    min = Math.min(0, ...values) * 1.13;
  const y = (v: number) => 285 - ((v - min) / (max - min)) * 250,
    x = (i: number) => 98 + i * 58;
  let path = "",
    active = false;
  points.forEach((p, i) => {
    if (p.ytd === null) {
      active = false;
      return;
    }
    path += `${active ? "L" : "M"}${x(i)},${y(p.ytd)} `;
    active = true;
  });
  return (
    <>
      <PlotGrid max={max} min={min} />
      {points.map((p, i) => (
        <g key={i}>
          {p.monthly !== null && (
            <rect
              x={x(i) - 15}
              y={Math.min(y(p.monthly), y(0))}
              width="30"
              height={Math.max(1, Math.abs(y(0) - y(p.monthly)))}
              rx="3"
              fill="#d0bd93"
            >
              <title>
                {p.label} · {monthlyLabel}: {p.monthly.toFixed(2)} kEUR
              </title>
            </rect>
          )}
          <text
            x={x(i)}
            y="308"
            textAnchor="middle"
            fontSize="12"
            fill="#706f67"
          >
            {p.label}
          </text>
        </g>
      ))}
      <path d={path} stroke="#a77a35" strokeWidth="3" fill="none" />
      {points.map(
        (p, i) =>
          p.ytd !== null && (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.ytd)}
              r="4"
              fill="#fffefa"
              stroke="#a77a35"
              strokeWidth="2"
            >
              <title>
                {p.label} · {ytdLabel}: {p.ytd.toFixed(2)} kEUR
              </title>
            </circle>
          ),
      )}
      <Legend
        labels={[
          { name: monthlyLabel, color: "#d0bd93" },
          { name: ytdLabel, color: "#a77a35" },
        ]}
      />
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
        return (
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
          >
            <title>
              {r.name}: {r.value.toFixed(2)} kEUR ·{" "}
              {((r.value / total) * 100).toFixed(1)}%
            </title>
          </circle>
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
          <rect width="10" height="10" rx="2" fill={graphicColors[i]} />
          <text x="20" y="10" fontSize="13">
            {r.name.length > 30 ? r.name.slice(0, 29) + "…" : r.name}
          </text>
          <text x="374" y="10" textAnchor="end" fontSize="13">
            {formatK(r.value)} · {((r.value / total) * 100).toFixed(1)}%
          </text>
        </g>
      ))}
    </>
  );
}
