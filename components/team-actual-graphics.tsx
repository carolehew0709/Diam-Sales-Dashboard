"use client";
import type { Dashboard } from "@/lib/dashboard";
import { months } from "@/lib/dashboard";
import { GraphicCard } from "./graphic-card";
import { ChartMark } from "./chart-interaction";
import { ComboPlot, PlotEmpty } from "./graphic-plots";
import { useI18n } from "./i18n-provider";
export function TeamActualGraphics({ data }: { data: Dashboard }) {
  const { tr, display } = useI18n();
  const source = data.graphics.teamActuals;
  if (!source) return null;
  const exact = (n: number | null) =>
    n === null
      ? "—"
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const context = `${source.reportingWeek ? `W${source.reportingWeek} · ` : ""}${tr("teamActual.period", { year: source.year, month: String(source.month).padStart(2, "0") })} · ${display(data.filters.region)} · ${data.filters.bu === "all" ? tr("filters.allBU") : data.filters.bu} · ${data.filters.salesType === "all" ? tr("filters.allSales") : display(data.filters.salesType)} · ${data.filters.salesTeam === "all" ? tr("team.all") : data.filters.salesTeam} · ${tr("teamActual.sales")} ${exact(source.sales)} / ${tr("teamActual.budget")} ${exact(source.budget)} kEUR`;
  const reconciliation=source.excludedDdcGroup && source.sales!==null ? tr("teamActual.reconciliation",{source:source.sourceSales!.toLocaleString(undefined,{maximumFractionDigits:3}),excluded:source.excludedDdcGroup.toLocaleString(undefined,{maximumFractionDigits:3}),reported:source.sales.toLocaleString(undefined,{maximumFractionDigits:3})}):"";
  const note = `${reconciliation} ${tr(source.unavailable ? "teamActual.unavailable" : "teamActual.rule")} ${source.sourceFile} · ${source.sourceSheet}`;
  const points = source.monthly.map((monthly, i) => ({
    label: display(months[i]),
    monthly,
    ytd:
      monthly === null
        ? null
        : source.monthly.slice(0, i + 1).reduce<number>((a, b) => a + b!, 0),
    estimated: i >= source.month,
  }));
  return (
    <>
      <GraphicCard
        className="team-actual-trend"
        title={tr("teamActual.title")}
        context={context}
        note={note}
        height={395}
        exportTable={{
          columns: [
            { label: tr("common.month") },
            { label: tr("teamActual.sales") + " (kEUR)" },
            { label: tr("teamActual.cumulative") + " (kEUR)" },
            { label: tr("common.source") },
          ],
          rows: points.map((p) => [
            p.label,
            p.monthly,
            p.ytd,
            source.sourceFile + " · " + source.sourceSheet,
          ]),
        }}
        table={
          <table className="bu-table">
            <thead>
              <tr>
                <th>{tr("common.month")}</th>
                <th>{tr("teamActual.sales")}</th>
                <th>{tr("teamActual.cumulative")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{exact(p.monthly)}</td>
                  <td>{exact(p.ytd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ComboPlot
          points={points}
          monthlyLabel={tr("teamActual.sales")}
          ytdLabel={tr("teamActual.cumulative")}
          empty={tr("teamActual.unavailable")}
        />
      </GraphicCard>
      <GraphicCard
        className="team-actual-budget"
        title={tr("teamActual.budgetTitle")}
        context={context}
        note={note}
        height={Math.max(220, source.groups.length * 45 + 80)}
        exportTable={{
          columns: [
            { label: tr("team.label") },
            { label: tr("teamActual.sales") + " (kEUR)" },
            { label: tr("teamActual.budget") + " (kEUR)" },
            { label: tr("teamActual.attainment"), format: "0.0%" },
          ],
          rows: [
            ...source.groups.map((r) => [
              r.name,
              r.sales,
              r.budget,
              r.attainment,
            ]),
            [tr("team.all"), source.sales, source.budget, source.attainment],
          ],
          summaryRows: [source.groups.length],
        }}
        table={
          <table className="bu-table">
            <thead>
              <tr>
                <th>{tr("team.label")}</th>
                <th>{tr("teamActual.sales")}</th>
                <th>{tr("teamActual.budget")}</th>
                <th>{tr("teamActual.attainment")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...source.groups,
                {
                  name: tr("team.all"),
                  sales: source.sales,
                  budget: source.budget,
                  attainment: source.attainment,
                },
              ].map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{exact(r.sales)}</td>
                  <td>{exact(r.budget)}</td>
                  <td>
                    {r.attainment === null
                      ? "—"
                      : (r.attainment * 100).toFixed(1) + "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        {source.groups.length ? (
          <>
            {source.groups.map((r, i) => {
              const max = Math.max(
                1,
                ...source.groups.flatMap((x) => [x.sales, x.budget]),
              );
              return (
                <g key={r.name}>
                  <ChartMark
                    color="#a77a35"
                    data={{
                      title: r.name,
                      rows: [
                        {
                          label: tr("teamActual.sales"),
                          value: exact(r.sales) + " kEUR",
                        },
                        {
                          label: tr("teamActual.budget"),
                          value: exact(r.budget) + " kEUR",
                        },
                        {
                          label: tr("teamActual.attainment"),
                          value:
                            r.attainment === null
                              ? "—"
                              : (r.attainment * 100).toFixed(1) + "%",
                        },
                      ],
                    }}
                  >
                    <text x="8" y={40 + i * 45} fontSize="12">
                      {r.name}
                    </text>
                    <rect
                      x="150"
                      y={25 + i * 45}
                      width={(Math.max(0, r.budget) / max) * 450}
                      height="18"
                      fill="#e4ddcd"
                    />
                    <rect
                      x="150"
                      y={28 + i * 45}
                      width={(Math.max(0, r.sales) / max) * 450}
                      height="12"
                      fill="#a77a35"
                    />
                    <text x="610" y={40 + i * 45} fontSize="11">
                      {exact(r.sales)} / {exact(r.budget)} ·{" "}
                      {r.attainment === null
                        ? "—"
                        : (r.attainment * 100).toFixed(1) + "%"}
                    </text>
                  </ChartMark>
                </g>
              );
            })}
            <text x="150" y={source.groups.length * 45 + 65} fontSize="11">
              {tr("teamActual.sales")} / {tr("teamActual.budget")} · kEUR
            </text>
          </>
        ) : (
          <PlotEmpty text={tr("teamActual.unavailable")} />
        )}
      </GraphicCard>
    </>
  );
}
