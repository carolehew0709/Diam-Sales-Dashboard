"use client";

import { integerAxis } from "@/lib/chart-axis";
import { useRef } from "react";
import { weekLabel, type pipelineMovement } from "@/lib/pipeline";
import { ChartMark } from "./chart-interaction";
import { GraphicCard } from "./graphic-card";
import { useI18n } from "./i18n-provider";
import { ChartWorkbookExport } from "./chart-workbook-export";
import { useWorkbookGroup } from "./use-workbook-group";

type TrendProps = {
  series: ReturnType<typeof pipelineMovement>["trend"];
  context: string;
};

export function PipelineTrend(props: TrendProps) {
  const group = useRef<HTMLDivElement>(null);
  useWorkbookGroup(group, () => <TrendChart {...props} />);
  if (!props.series.length) return null;
  return (
    <div>
      <div ref={group}>
        <TrendChart {...props} />
      </div>
      <ChartWorkbookExport layoutLabel="pipeline.workbookLayout" />
    </div>
  );
}

function TrendChart({ series, context }: TrendProps) {
  const { tr, locale } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const { max, ticks } = integerAxis(
    series.flatMap((point) => [point.added, point.lost]),
  );
  const x = (i: number) =>
    series.length === 1
      ? 411
      : Math.round(54 + (i * 715) / (series.length - 1));
  const y = (value: number) => Math.round(221 - (value * 189) / max);
  const lines = [
    { key: "added", label: tr("pipeline.cumulativeAdded"), color: "#256655" },
    { key: "lost", label: tr("pipeline.cumulativeLost"), color: "#aa5654" },
  ] as const;
  const stride = Math.ceil(series.length / 7);
  return (
    <GraphicCard
      title={tr("pipeline.cumulative")}
      context={context}
      note={tr("pipeline.eventsNote")}
      height={280}
      exportTable={{
        columns: [
          { label: tr("common.week") },
          ...lines.map(({ label }) => ({ label })),
        ],
        rows: series.map(({ week, added, lost }) => [
          weekLabel(week),
          added,
          lost,
        ]),
      }}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1="54" x2="769" y1={y(tick)} y2={y(tick)} stroke="#e2ded4" />
          <text x="45" y={y(tick) + 4} textAnchor="end" fill="#706f67">
            {number.format(tick)}
          </text>
        </g>
      ))}
      {series.map(
        (point, i) =>
          ((i % stride === 0 && i <= series.length - stride) ||
            i === series.length - 1) && (
            <text
              key={point.week}
              x={x(i)}
              y="244"
              textAnchor="middle"
              fill="#706f67"
            >
              {weekLabel(point.week).split(" · ")[1]}
            </text>
          ),
      )}
      {lines.map(({ key, label, color }, index) => (
        <g key={key}>
          <polyline
            points={series
              .map((point, i) => `${x(i)},${y(point[key])}`)
              .join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
          />
          <circle cx={75 + index * 245} cy="266" r="4" fill={color} />
          <text x={86 + index * 245} y="271" fill="#3d4036">
            {label}
          </text>
        </g>
      ))}
      {series.map((point, i) => (
        <ChartMark
          key={point.week}
          color={lines[0].color}
          lift={[0, 0]}
          data={{
            title: weekLabel(point.week),
            rows: lines.map(({ key, label }) => ({
              label,
              value: number.format(point[key]),
            })),
          }}
          hit={<rect x={x(i) - 8} y="32" width="16" height="190" fill="#fff" />}
        >
          {lines.map(({ key, color }) => (
            <circle
              key={key}
              cx={x(i)}
              cy={y(point[key])}
              r="4"
              fill={color}
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
        </ChartMark>
      ))}
    </GraphicCard>
  );
}
