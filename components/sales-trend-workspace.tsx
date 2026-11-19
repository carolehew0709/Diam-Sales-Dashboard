"use client";
import { useEffect, useRef, useState } from "react";
import { SalesMonthlyGraphic } from "./sales-monthly-graphic";
import { GraphicCard } from "./graphic-card";
import { ComboPlot } from "./graphic-plots";
import { useI18n } from "./i18n-provider";
import { useWorkbookGroup } from "./use-workbook-group";
import { months, type Dashboard } from "@/lib/dashboard";
import { customerAnalysisQuery } from "@/lib/dashboard-presentation";
import { salesNumber } from "@/lib/chart-tooltip";
import {
  monthlyDetailPoints,
  monthlyDetailRows,
  type MonthlyDetailFilters,
  type customerMonthlyView,
} from "@/lib/customer-monthly";
import type { MessageKey } from "@/lib/i18n";
import styles from "./sales-trend-workspace.module.css";

type View = ReturnType<typeof customerMonthlyView>;
type Source = NonNullable<View["source"]>;
const categoryKeys: Record<string, MessageKey> = {
  "Key Customer": "graphics.keyCustomers",
  "Other Customers": "graphics.otherCustomers",
  Intergroup: "monthlyDetail.intergroup",
  "Intergroup D3": "graphics.intergroupD3",
  "Intergroup FR": "graphics.intergroupFR",
  "Intergroup Other Customers": "graphics.intergroupOther",
};

function MonthlyDetailChart({
  source,
  selection,
  exportOnly = false,
}: {
  source: Source;
  selection: MonthlyDetailFilters;
  exportOnly?: boolean;
}) {
  const { tr, display, locale } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(
    root,
    exportOnly
      ? null
      : () => (
          <MonthlyDetailChart
            source={source}
            selection={selection}
            exportOnly
          />
        ),
  );
  const points = monthlyDetailPoints(source.details, selection);
  const label = (name: string) =>
    categoryKeys[name] ? tr(categoryKeys[name]) : name;
  const context = [
    tr("regions.China"),
    String(selection.year),
    tr("monthlyDetail.cutoff", {
      month: display(months[source.details.cutoffMonth - 1]),
    }),
    selection.team || tr("team.all"),
    ...["category", "subgroup", "customer"].flatMap((k) =>
      selection[k as keyof MonthlyDetailFilters]
        ? [label(String(selection[k as keyof MonthlyDetailFilters]))]
        : [],
    ),
    "kEUR",
  ].join(" · ");
  const note = tr("monthlyDetail.sourceNote", {
    source: `${source.sourceFile} · ${source.details.sourceSheet}!${source.details.sourceRange}`,
  });
  return (
    <div ref={root} data-monthly-detail-chart>
      <GraphicCard
        title={tr("monthlyDetail.title")}
        context={context}
        note={note}
        height={395}
        table={
          <table className="bu-table">
            <thead>
              <tr>
                <th>{tr("common.month")}</th>
                <th>{tr("graphics.monthlySales")} (kEUR)</th>
                <th>{tr("graphics.cumulativeSales")} (kEUR)</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, i) => (
                <tr key={i}>
                  <td>{display(months[i])}</td>
                  <td>
                    {salesNumber(point.monthly, locale, 2)}
                  </td>
                  <td>
                    {salesNumber(point.ytd, locale, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        exportTable={{
          columns: [
            { label: tr("common.month") },
            { label: `${tr("graphics.monthlySales")} (kEUR)` },
            { label: `${tr("graphics.cumulativeSales")} (kEUR)` },
            { label: tr("common.source") },
          ],
          rows: points.map((p, i) => [
            display(months[i]),
            p.monthly,
            p.ytd,
            `${source.sourceFile} · ${source.details.sourceSheet}`,
          ]),
        }}
      >
        <ComboPlot
          points={points.map((p, i) => ({
            ...p,
            label: display(months[i]),
            estimated: i >= source.details.cutoffMonth,
          }))}
          monthlyLabel={tr("graphics.monthlySales")}
          ytdLabel={tr("graphics.cumulativeSales")}
          empty={tr("graphics.noSales")}
        />
      </GraphicCard>
    </div>
  );
}

export function SalesTrendWorkspace({ data }: { data: Dashboard }) {
  const { tr } = useI18n();
  const [mode, setMode] = useState("entity");
  const query = customerAnalysisQuery(data.filters, "");
  const [response, setResponse] = useState<{
    key: string;
    view?: View;
    error?: boolean;
  }>();
  const [selection, setSelection] = useState<MonthlyDetailFilters>({
    year: 0,
    team: "",
    category: "",
    subgroup: "",
    customer: "",
  });
  const key = `${query}|${data.revision}`;
  useEffect(() => {
    if (mode !== "detail") return;
    const c = new AbortController();
    void fetch(`/api/sales-monthly-details?${query}`, { signal: c.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) throw Error();
        if (!c.signal.aborted) setResponse({ key, view: j.data });
      })
      .catch(() => {
        if (!c.signal.aborted) setResponse({ key, error: true });
      });
    return () => c.abort();
  }, [mode, query, key]);
  const current = response?.key === key ? response : undefined,
    source = (current ?? response)?.view?.source;
  const effective = source
    ? {
        ...selection,
        year: source.details.years.includes(selection.year)
          ? selection.year
          : source.year,
      }
    : selection;
  const label = (name: string) =>
    categoryKeys[name]
      ? tr(categoryKeys[name])
      : name === "__unassigned__"
        ? tr("team.unassigned")
        : name || tr("team.unassigned");
  const pick = (field: keyof MonthlyDetailFilters, value: string) =>
    setSelection((s) => ({
      ...s,
      [field]: field === "year" ? Number(value) : value,
      ...(field === "team"
        ? { category: "", subgroup: "", customer: "" }
        : field === "category"
          ? { subgroup: "", customer: "" }
          : field === "subgroup"
            ? { customer: "" }
            : {}),
    }));
  const options = (field: "team" | "category" | "subgroup" | "customer") => {
    if (!source) return [];
    const before: Partial<MonthlyDetailFilters> = {};
    if (field !== "team") before.team = effective.team;
    if (field === "subgroup" || field === "customer")
      before.category = effective.category;
    if (field === "customer") before.subgroup = effective.subgroup;
    return [
      ...new Set(
        monthlyDetailRows(source.details, before)
          .map((r) =>
            field === "team"
              ? r.team || "__unassigned__"
              : field === "category"
                ? r.path[0]
                : field === "subgroup"
                  ? (r.path[1] ?? "")
                  : r.name,
          )
          .filter(Boolean),
      ),
    ].sort();
  };
  return (
    <div
      className={styles.workspace}
      aria-busy={mode === "detail" && !current}
      data-customer-status={
        mode === "detail"
          ? !current
            ? "loading"
            : current.error
              ? "error"
              : undefined
          : undefined
      }
    >
      <div
        className={styles.modes}
        role="group"
        aria-label={tr("monthlyDetail.basis")}
      >
        <button
          type="button"
          aria-pressed={mode === "entity"}
          onClick={() => setMode("entity")}
        >
          {tr("monthlyDetail.entityTrend")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "detail"}
          onClick={() => setMode("detail")}
        >
          {tr("monthlyDetail.title")}
        </button>
      </div>
      {mode === "entity" ? (
        <SalesMonthlyGraphic data={data} standalone />
      ) : !current && !source ? (
        <p role="status">{tr("auth.updating")}</p>
      ) : !source ? (
        <p className="apac-notice" role={current?.error ? "alert" : undefined}>
          {tr(
            current?.error
              ? "monthlyDetail.loadError"
              : !current?.view?.permitted || !current?.view?.scopeMatches
                ? "monthlyDetail.scope"
                : "monthlyDetail.noSource",
          )}
        </p>
      ) : (
        <>
          <div
            className={styles.filters}
            aria-label={tr("monthlyDetail.filters")}
          >
            <label>
              {tr("filters.years")}
              <select
                aria-label={tr("monthlyDetail.year")}
                value={effective.year}
                onChange={(e) => pick("year", e.target.value)}
              >
                {source.details.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {(["team", "category", "subgroup", "customer"] as const).map(
              (field) =>
                field === "subgroup" &&
                (!effective.category || !options("subgroup").length) ? null : (
                  <label key={field}>
                    {tr(
                      field === "team"
                        ? "team.label"
                        : field === "customer"
                          ? "ar.customer"
                          : field === "category"
                            ? "monthlyDetail.category"
                            : "monthlyDetail.subgroup",
                    )}
                    <select
                      aria-label={tr(`monthlyDetail.${field}`)}
                      value={effective[field]}
                      onChange={(e) => pick(field, e.target.value)}
                    >
                      <option value="">{tr("ar.all")}</option>
                      {effective[field] &&
                        !options(field).includes(effective[field]) && (
                          <option value={effective[field]}>
                            {label(effective[field])}
                          </option>
                        )}
                      {options(field).map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                ),
            )}
          </div>
          <MonthlyDetailChart source={source} selection={effective} />
        </>
      )}
    </div>
  );
}
