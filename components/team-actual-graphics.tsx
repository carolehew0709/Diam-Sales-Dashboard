"use client";
import type { Dashboard } from "@/lib/dashboard";
import { salesNumber } from "@/lib/chart-tooltip";
import { GraphicCard } from "./graphic-card";
import { ChartMark } from "./chart-interaction";
import { PlotEmpty } from "./graphic-plots";
import { useI18n } from "./i18n-provider";
export function TeamBudgetGraphic({ data }: { data: Dashboard }) {
  const { tr, display, locale } = useI18n();
  const source = data.graphics.teamActuals;
  if (!source) return null;
  const exact = (n: number | null) => salesNumber(n, locale, 2);
  const rounded = (n: number | null) => salesNumber(n, locale);
  const rate = (n: number | null, digits = 0) =>
    salesNumber(n, locale, digits, "percent");
  const context = `${source.reportingWeek ? `W${source.reportingWeek} · ` : ""}${tr("teamActual.period", { year: source.year, month: String(source.month).padStart(2, "0") })} · ${display(data.filters.region)} · ${data.filters.bu === "all" ? tr("filters.allBU") : data.filters.bu} · ${data.filters.salesType === "all" ? tr("filters.allSales") : display(data.filters.salesType)} · ${data.filters.salesTeam === "all" ? tr("team.all") : data.filters.salesTeam} · kEUR`;
  const max = Math.max(
    1,
    ...source.groups.flatMap((row) => [row.sales, row.budget]),
  );
  const reconciliation =
    source.excludedDdcGroup && source.sales !== null
      ? tr("teamActual.reconciliation", {
          source: source.sourceSales!.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          }),
          excluded: source.excludedDdcGroup.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          }),
          reported: source.sales.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          }),
        })
      : "";
  const note = `${reconciliation} ${tr(source.unavailable ? "teamActual.unavailable" : "teamActual.rule")} ${source.sourceFile} · ${source.sourceSheet}`;
  return (
    <>
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
                  <td>{rate(r.attainment, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        {source.groups.length ? (
          <>
            <g fontSize="11" fontWeight="600" fill="#706f67" textAnchor="end">
              <text x="595" y="17">
                {tr("teamActual.sales")}
              </text>
              <text x="718" y="17">
                {tr("metric.budget")}
              </text>
              <text x="786" y="17">
                %
              </text>
            </g>
            {source.groups.map((r, i) => {
              return (
                <g key={r.name}>
                  <ChartMark
                    color="#a77a35"
                    data={{
                      title: r.name,
                      rows: [
                        {
                          label: tr("teamActual.sales"),
                          value: rounded(r.sales) + " kEUR",
                        },
                        {
                          label: tr("teamActual.budget"),
                          value: rounded(r.budget) + " kEUR",
                        },
                        {
                          label: tr("teamActual.attainment"),
                          value: rate(r.attainment),
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
                      width={(Math.max(0, r.budget) / max) * 350}
                      height="18"
                      fill="#e4ddcd"
                    />
                    <rect
                      x="150"
                      y={28 + i * 45}
                      width={(Math.max(0, r.sales) / max) * 350}
                      height="12"
                      fill="#a77a35"
                    />
                    <g fontSize="12" textAnchor="end">
                      <text x="595" y={40 + i * 45}>
                        {rounded(r.sales)}
                      </text>
                      <text x="718" y={40 + i * 45}>
                        {rounded(r.budget)}
                      </text>
                      <text x="786" y={40 + i * 45}>
                        {rate(r.attainment)}
                      </text>
                    </g>
                  </ChartMark>
                </g>
              );
            })}
          </>
        ) : (
          <PlotEmpty text={tr("teamActual.unavailable")} />
        )}
      </GraphicCard>
    </>
  );
}
