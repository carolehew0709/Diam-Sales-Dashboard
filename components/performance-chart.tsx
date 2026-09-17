"use client";
import { useI18n } from "@/components/i18n-provider";
import type { Amount } from "@/lib/types";
import { formatK } from "@/lib/dashboard";
export function PerformanceChart({
  rows,
  cumulative = false,
}: {
  rows: { label: string; budget: Amount; base: Amount; scenario: Amount }[];
  cumulative?: boolean;
}) {
  const { tr, display } = useI18n();
  const values = rows
    .flatMap((r) => [r.budget, r.base, r.scenario])
    .filter((v): v is number => v !== null);
  const max = Math.max(...values, 1) * 1.12;
  const x = (i: number) => 54 + (i * 640) / Math.max(rows.length - 1, 1),
    y = (v: number) => 224 - (v / max) * 194;
  const series = [
    {
      key: "budget" as const,
      color: "#9d9a91",
      label: tr("metric.budget"),
      dash: "6 5",
    },
    {
      key: "base" as const,
      color: "#171813",
      label: tr("metric.base"),
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
    <div className="apac-chart">
      <svg
        viewBox="0 0 720 260"
        role="img"
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
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(r[s.key]!)}
                    r="3.5"
                    fill="white"
                    stroke={s.color}
                  >
                    <title>
                      {display(r.label)} · {s.label}: {formatK(r[s.key])} kEUR
                    </title>
                  </circle>
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
      </svg>
      {!values.length && (
        <div className="chart-empty">
          {tr("chart.empty")}
          <br />
          {tr("chart.annualAvailable")}
        </div>
      )}
      <div className="apac-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <small className="chart-note">{tr("chart.gaps")}</small>
      </div>
    </div>
  );
}
