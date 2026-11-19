"use client";
import type { Dashboard } from "@/lib/dashboard";
import { months } from "@/lib/dashboard";
import { integerAxis } from "@/lib/chart-axis";
import { chartAmount } from "@/lib/chart-tooltip";
import { teamPerformanceSeries } from "@/lib/team-performance";
import { ChartMark } from "./chart-interaction";
import { GraphicCard } from "./graphic-card";
import { Legend, PlotEmpty, PlotGrid } from "./graphic-plots";
import { useI18n } from "./i18n-provider";

const colors = {
  sales: "#d0bd93",
  prospect: "#718699",
  actual: "#a77a35",
  plan: "#42695c",
};

export function TeamPerformanceGraphic({ data }: { data: Dashboard }) {
  const { tr, display, locale } = useI18n();
  const team = data.filters.salesTeam ?? "all";
  const teams = data.graphics.teams.filter(
    (row) => team === "all" || row.name === team,
  );
  const actuals = data.graphics.teamActuals;
  const view = teamPerformanceSeries(actuals, teams);
  const hasCombined = view.points.some((p) => p.cumulativeCombined !== null);
  const hasSales = view.points.some((p) => p.sales !== null);
  const hasProspect = view.points.some((p) => p.prospect !== null);
  const salesLabel = tr("teamActual.sales");
  const prospectLabel = tr("graphics.monthlyTeamOB");
  const actualLabel = tr("teamActual.cumulative");
  const planLabel = tr(
    hasCombined
      ? view.coverage === "partial"
        ? "teamTrend.knownCombined"
        : "graphics.cumulativeConfirmed"
      : "graphics.cumulativeTeamOB",
  );
  const combinedLabel = tr(
    view.coverage === "partial"
      ? "teamTrend.knownCombined"
      : "graphics.cumulativeConfirmed",
  );
  const weeks =
    (data.graphics.teamSource?.weeks ?? data.weeks)
      .map((w) => `W${w}`)
      .join(" / ") || tr("snapshot.none");
  const name =
    team === "all"
      ? tr("team.all")
      : team === "__unassigned__"
        ? tr("team.unassigned")
        : team;
  const context = `${data.filters.year} · ${display(data.filters.region)} · ${data.filters.bu === "all" ? tr("filters.allBU") : data.filters.bu} · ${data.filters.salesType === "all" ? tr("filters.allSales") : display(data.filters.salesType)} · ${name} · ${data.filters.customer && data.filters.customer !== "all" ? data.filters.customer + " · " : ""}${actuals && hasSales ? `${actuals.reportingWeek ? `W${actuals.reportingWeek} · ` : ""}${tr("teamActual.period", { year: actuals.year, month: String(actuals.month).padStart(2, "0") })} · ` : ""}Prospect ${weeks} · kEUR`;
  const actualSource =
    actuals && hasSales
      ? `${actuals.sourceFile} · ${actuals.sourceSheet}`
      : "—";
  const prospectSource =
    (
      data.graphics.teamSource?.files ?? [
        ...new Set(
          data.rows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])),
        ),
      ]
    ).join("; ") || "—";
  const codes = (ids: string[]) =>
    ids
      .map((id) => data.entities.find((e) => e.id === id)?.code ?? id)
      .join(" / ") || "—";
  const scope = tr(
    view.coverage === "partial" ? "teamTrend.partialScope" : "teamTrend.scope",
    {
      sales: codes(view.actualEntities),
      prospect: codes(view.prospectEntities),
    },
  );
  const note = `${tr("teamTrend.rule")} ${!hasSales ? tr("teamTrend.noActual") : ""} ${tr("teamTrend.actualSource")}: ${actualSource}. ${tr("teamTrend.prospectSource")}: ${prospectSource}.`;
  const labels = [
    salesLabel,
    prospectLabel,
    actualLabel,
    combinedLabel,
    tr("graphics.cumulativeTeamOB"),
  ];
  const values = view.points.map((p) => [
    p.sales,
    p.prospect,
    p.cumulativeSales,
    p.cumulativeCombined,
    p.cumulativeProspect,
  ]);
  const exact = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const planValue = (p: (typeof view.points)[number]) =>
    hasCombined ? p.cumulativeCombined : p.cumulativeProspect;
  const axis = integerAxis(
    view.points
      .flatMap((p) => [
        Math.max(0, p.sales ?? 0) + Math.max(0, p.prospect ?? 0),
        Math.min(0, p.sales ?? 0) + Math.min(0, p.prospect ?? 0),
        p.cumulativeSales,
        planValue(p),
      ])
      .filter((n): n is number => n !== null),
  );
  const x = (i: number) => 98 + i * 58;
  const y = (n: number) => 285 - ((n - axis.min) / (axis.max - axis.min)) * 250;
  const line = (key: "cumulativeSales" | "plan") => {
    let path = "",
      active = false;
    view.points.forEach((p, i) => {
      const value = key === "plan" ? planValue(p) : p[key];
      if (value === null) {
        active = false;
        return;
      }
      path += `${active ? "L" : "M"}${x(i)},${y(value)} `;
      active = true;
    });
    return path;
  };
  return (
    <GraphicCard
      className="team-combined-trend"
      title={tr("teamTrend.title", { name })}
      context={context}
      note={note}
      exportNote={`${note} ${scope}`}
      notice={scope}
      height={395}
      exportTable={{
        columns: [
          { label: tr("common.month") },
          ...labels.map((label) => ({ label: `${label} (kEUR)` })),
          { label: tr("teamTrend.actualSource") },
          { label: tr("teamTrend.prospectSource") },
        ],
        rows: values.map((row, i) => [
          display(months[i]),
          ...row,
          actualSource,
          prospectSource,
        ]),
      }}
      table={
        <table className="bu-table">
          <thead>
            <tr>
              <th>{tr("common.month")}</th>
              {labels.map((label) => (
                <th key={label}>{label} (kEUR)</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row, i) => (
              <tr key={months[i]}>
                <td>{display(months[i])}</td>
                {row.map((v, j) => (
                  <td key={j}>{exact(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {!hasSales && !hasProspect ? (
        <PlotEmpty text={tr("graphics.noTeam")} />
      ) : (
        <>
          <PlotGrid min={axis.min} max={axis.max} />
          {view.points.map((p, i) => {
            const plan = planValue(p);
            const positiveSales = Math.max(0, p.sales ?? 0),
              negativeSales = Math.min(0, p.sales ?? 0);
            const start = (p.prospect ?? 0) < 0 ? negativeSales : positiveSales;
            return (
              <g key={months[i]}>
                {(p.sales !== null ||
                  p.prospect !== null ||
                  plan !== null ||
                  p.cumulativeSales !== null) && (
                  <ChartMark
                    color={colors.prospect}
                    data={{
                      title: display(months[i]),
                      rows: [
                        {
                          label: salesLabel,
                          value: chartAmount(p.sales, locale),
                        },
                        {
                          label: prospectLabel,
                          value: chartAmount(p.prospect, locale),
                        },
                        {
                          label: actualLabel,
                          value: chartAmount(p.cumulativeSales, locale),
                        },
                        { label: planLabel, value: chartAmount(plan, locale) },
                      ],
                    }}
                    hit={
                      <rect
                        x={x(i) - 24}
                        y="28"
                        width="48"
                        height="266"
                        fill="white"
                      />
                    }
                  >
                    {p.sales !== null && (
                      <rect
                        x={x(i) - 15}
                        y={Math.min(y(p.sales), y(0))}
                        width="30"
                        height={Math.max(1, Math.abs(y(p.sales) - y(0)))}
                        fill={colors.sales}
                      />
                    )}
                    {p.prospect !== null && (
                      <rect
                        x={x(i) - 15}
                        y={Math.min(y(start + p.prospect), y(start))}
                        width="30"
                        height={Math.max(
                          1,
                          Math.abs(y(start + p.prospect) - y(start)),
                        )}
                        fill={colors.prospect}
                      />
                    )}
                    {p.cumulativeSales !== null && (
                      <circle
                        cx={x(i)}
                        cy={y(p.cumulativeSales)}
                        r="4"
                        fill="#fffefa"
                        stroke={colors.actual}
                        strokeWidth="2"
                      />
                    )}
                    {plan !== null && (
                      <circle
                        cx={x(i)}
                        cy={y(plan)}
                        r="4"
                        fill="#fffefa"
                        stroke={colors.plan}
                        strokeWidth="2"
                      />
                    )}
                  </ChartMark>
                )}
                <text
                  x={x(i)}
                  y="308"
                  textAnchor="middle"
                  fontSize="12"
                  fill="#706f67"
                >
                  {display(months[i])}
                </text>
              </g>
            );
          })}
          <path
            d={line("cumulativeSales")}
            stroke={colors.actual}
            strokeWidth="3"
            fill="none"
            pointerEvents="none"
          />
          <path
            d={line("plan")}
            stroke={colors.plan}
            strokeWidth="3"
            strokeDasharray="6 4"
            fill="none"
            pointerEvents="none"
          />
          <Legend
            labels={[
              ...(hasSales ? [{ name: salesLabel, color: colors.sales }] : []),
              ...(hasProspect
                ? [{ name: prospectLabel, color: colors.prospect }]
                : []),
            ]}
          />
          <Legend
            y={375}
            labels={[
              ...(hasSales
                ? [{ name: actualLabel, color: colors.actual }]
                : []),
              ...(view.points.some((p) => planValue(p) !== null)
                ? [{ name: planLabel, color: colors.plan }]
                : []),
            ]}
          />
        </>
      )}
    </GraphicCard>
  );
}
