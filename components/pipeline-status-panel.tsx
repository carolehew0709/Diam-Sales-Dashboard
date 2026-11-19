"use client";
import { useRef, useState } from "react";
import { pipelineStages, weekLabel, type Opportunity } from "@/lib/pipeline";
import {
  projectPeriodRows,
  projectStatusTrend,
  projectTotals,
  type PipelinePeriod,
} from "@/lib/pipeline-projects";
import { integerAxis } from "@/lib/chart-axis";
import { useI18n } from "./i18n-provider";
import { GraphicCard } from "./graphic-card";
import { ChartMark } from "./chart-interaction";
import { useWorkbookGroup } from "./use-workbook-group";
import styles from "./commercial.module.css";

export function PipelineStatusSummary({
  rows,
  byStage = false,
}: {
  rows: Opportunity[];
  byStage?: boolean;
}) {
  const { tr, locale } = useI18n(),
    number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const visible = byStage ? rows : rows.filter((r) => r.status !== "won");
  const keys = byStage
    ? [
        ...pipelineStages,
        ...(visible.some((r) => !r.stage) ? ["unspecified"] : []),
      ]
    : ["total", "active", "lost"];
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{tr(byStage ? "pipeline.stage" : "pipeline.status")}</th>
            <th>{tr("pipeline.projects")}</th>
            <th>{tr("pipeline.estimated")}</th>
            <th>{tr("pipeline.projectIncomeMissing")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const value = projectTotals(
              visible.filter(
                (r) =>
                  key === "total" ||
                  (byStage ? (r.stage ?? "unspecified") : r.status) === key,
              ),
            );
            return (
              <tr key={key}>
                <th scope="row">
                  {tr(
                    key === "unspecified"
                      ? "pipeline.unspecified"
                      : byStage
                        ? `pipeline.stage.${key as (typeof pipelineStages)[number]}`
                        : `pipeline.status.${key as "total" | "active" | "lost"}`,
                  )}
                </th>
                <td>{number.format(value.projects)}</td>
                <td>{value.kEUR === null ? "—" : number.format(value.kEUR)}</td>
                <td>{number.format(value.missing)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  rows: Opportunity[];
  reference: Opportunity[];
  asOf: string;
  context: string;
  byStage?: boolean;
};
const colors = [
  "#346e9c",
  "#aa5654",
  "#b18438",
  "#38765f",
  "#765690",
  "#77776f",
];
function StatusTrend({
  rows,
  reference,
  asOf,
  context,
  byStage = false,
  period,
  metric,
}: Props & { period: PipelinePeriod; metric: "projects" | "kEUR" }) {
  const { tr, locale } = useI18n();
  const keys = byStage
    ? [
        ...pipelineStages,
        ...(rows.some((r) => !r.stage) ? ["unspecified"] : []),
      ]
    : ["active", "lost"];
  const series = projectStatusTrend(
    rows,
    reference,
    asOf,
    period,
    keys,
    byStage,
  );
  const label = (key: string) =>
    tr(
      key === "unspecified"
        ? "pipeline.unspecified"
        : byStage
          ? `pipeline.stage.${key as (typeof pipelineStages)[number]}`
          : `pipeline.status.${key as "active" | "lost"}`,
    );
  const title = tr("pipeline.statusTrendTitle", {
    name: tr(byStage ? "pipeline.salesStages" : "pipeline.weeklyStatus"),
    period: tr(period === "weekly" ? "pipeline.weekly" : "pipeline.ytd"),
  });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    axis = integerAxis(series.flatMap((p) => p.values.map((v) => v[metric])));
  const x = (i: number) => 54 + (i * 715) / Math.max(1, series.length - 1),
    y = (v: number) => 212 - ((v - axis.min) / (axis.max - axis.min)) * 180;
  const stride = Math.ceil(series.length / 6);
  return (
    <GraphicCard
      title={title}
      context={`${context} · ${metric === "projects" ? tr("pipeline.projects") : "kEUR"}`}
      note={tr("pipeline.cohortNote")}
      height={285}
      exportTable={{
        columns: [
          { label: tr("common.week") },
          ...keys.map((key) => ({
            label: `${label(key)} (${metric === "projects" ? tr("pipeline.projects") : "kEUR"})`,
          })),
        ],
        rows: series.map((p) => [
          weekLabel(p.week),
          ...p.values.map((v) => v[metric]),
        ]),
      }}
    >
      {axis.ticks.map((t) => (
        <g key={t}>
          <line x1={54} x2={769} y1={y(t)} y2={y(t)} stroke="#e2ded4" />
          <text x={45} y={y(t) + 4} textAnchor="end" fill="#706f67">
            {Math.round(t).toLocaleString(locale)}
          </text>
        </g>
      ))}
      {series.map((p, i) =>
        i % stride === 0 || i === series.length - 1 ? (
          <text
            key={p.week}
            x={x(i)}
            y={235}
            textAnchor="middle"
            fill="#706f67"
          >
            {weekLabel(p.week).split(" · ")[1]}
          </text>
        ) : null,
      )}
      {keys.map((key, k) => {
        let known = false;
        const d = series
          .map((p, i) => {
            const value = p.values[k][metric];
            if (value === null) {
              known = false;
              return "";
            }
            const point = `${known ? "L" : "M"}${x(i)},${y(value)}`;
            known = true;
            return point;
          })
          .join(" ");
        return (
          <g key={key}>
            <path d={d} fill="none" stroke={colors[k]} strokeWidth={2} />
            <circle
              cx={65 + (k % 3) * 240}
              cy={255 + Math.floor(k / 3) * 22}
              r={4}
              fill={colors[k]}
            />
            <text
              x={76 + (k % 3) * 240}
              y={259 + Math.floor(k / 3) * 22}
              fill="#3d4036"
            >
              {label(key)}
            </text>
          </g>
        );
      })}
      {series.map((p, i) => (
        <ChartMark
          key={p.week}
          color={colors[0]}
          lift={[0, 0]}
          data={{
            title: weekLabel(p.week),
            rows: p.values.map((v) => ({
              label: label(v.key),
              value: v[metric] === null ? "—" : number.format(v[metric]!),
            })),
          }}
          hit={<rect x={x(i) - 6} y={32} width={12} height={182} fill="#fff" />}
        >
          <g>
            {p.values.map((v, k) =>
              v[metric] === null ? null : (
                <circle
                  key={v.key}
                  cx={x(i)}
                  cy={y(v[metric]!)}
                  r={3}
                  fill={colors[k]}
                />
              ),
            )}
          </g>
        </ChartMark>
      ))}
    </GraphicCard>
  );
}

export function PipelineStatusPanel(props: Props) {
  const { tr } = useI18n();
  const [period, setPeriod] = useState<PipelinePeriod>("weekly"),
    [metric, setMetric] = useState<"projects" | "kEUR">("projects");
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(root, () => (
    <StatusTrend {...props} period={period} metric={metric} />
  ));
  const rows = projectPeriodRows(
    props.rows,
    props.reference,
    props.asOf,
    period,
  );
  return (
    <section
      className={styles.panel}
      data-pipeline-status={props.byStage ? "stage" : "project"}
    >
      <div className={styles.sectionHeading}>
        <h2>
          {tr(props.byStage ? "pipeline.salesStages" : "pipeline.weeklyStatus")}
        </h2>
        <div
          className={styles.segments}
          role="group"
          aria-label={tr("pipeline.period")}
        >
          {(["weekly", "ytd"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {tr(value === "weekly" ? "pipeline.weekly" : "pipeline.ytd")}
            </button>
          ))}
        </div>
      </div>
      <PipelineStatusSummary rows={rows} byStage={props.byStage} />
      <p className={styles.note}>
        {tr(
          props.byStage
            ? "pipeline.stageProjectNote"
            : "pipeline.projectStatusNote",
        )}
      </p>
      <div
        className={styles.segments}
        role="group"
        aria-label={tr("pipeline.trendMeasure")}
      >
        <button
          type="button"
          aria-pressed={metric === "projects"}
          onClick={() => setMetric("projects")}
        >
          {tr("pipeline.projects")}
        </button>
        <button
          type="button"
          aria-pressed={metric === "kEUR"}
          onClick={() => setMetric("kEUR")}
        >
          kEUR
        </button>
      </div>
      <div ref={root}>
        <StatusTrend {...props} period={period} metric={metric} />
      </div>
    </section>
  );
}
