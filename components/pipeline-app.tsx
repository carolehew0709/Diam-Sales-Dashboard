"use client";

import { useEffect, useState } from "react";
import { matchesRegion, regions } from "@/lib/entities";
import type { MessageKey } from "@/lib/i18n";
import {
  pipelineFilters,
  pipelineFx,
  pipelineIncomeKEUR,
  pipelineRows,
  weekLabel,
  type PipelineData,
  type PipelineFilters,
} from "@/lib/pipeline";
import { useI18n } from "./i18n-provider";
import { PipelineImport } from "./pipeline-import";
import { PipelineTrend } from "./pipeline-trend";
import {
  PipelineStatusPanel,
  PipelineStatusSummary,
} from "./pipeline-status-panel";
import { pipelineProjectMovement, projectKey } from "@/lib/pipeline-projects";
import styles from "./commercial.module.css";

const filterKeys = ["region", "entity", "team", "group", "customer"] as const;
const filterLabels: Record<keyof PipelineFilters, MessageKey> = {
  region: "filters.region",
  entity: "common.entity",
  team: "pipeline.salesTeam",
  group: "ar.customerGroup",
  customer: "common.customer",
};

function FilterBar({
  data,
  filters,
  onChange,
}: {
  data: PipelineData;
  filters: PipelineFilters;
  onChange: (filters: PipelineFilters) => void;
}) {
  const { tr, display } = useI18n();
  const options = (
    key: keyof PipelineFilters,
    index: number,
  ): [string, string][] => {
    if (key === "region")
      return regions
        .filter((region) => data.scope.some((e) => matchesRegion(e, region)))
        .map((region) => [region, display(region)]);
    if (key === "entity")
      return data.scope
        .filter((e) => !filters.region || matchesRegion(e, filters.region))
        .map((e) => [e.id, e.code]);
    const scope = {
      ...pipelineFilters,
      ...Object.fromEntries(
        filterKeys.slice(0, index).map((name) => [name, filters[name]]),
      ),
    };
    const field = key === "group" ? "customerGroup" : key;
    const values = [
      ...new Set(pipelineRows(data.current, scope).map((row) => row[field])),
    ].sort((a, b) => a.localeCompare(b));
    return values.map((value) => [
      value || "__missing__",
      value || tr("pipeline.unspecified"),
    ]);
  };
  return (
    <div className={styles.filters} aria-label={tr("filters.global")}>
      {filterKeys.map((key, index) => {
        const values = options(key, index);
        return (
          <label key={key}>
            {tr(filterLabels[key])}
            {key === "group" && <small>{tr("pipeline.brandBasis")}</small>}
            <select
              aria-label={tr(filterLabels[key])}
              value={filters[key]}
              onChange={(event) =>
                onChange({
                  ...pipelineFilters,
                  ...Object.fromEntries(
                    filterKeys
                      .slice(0, index)
                      .map((name) => [name, filters[name]]),
                  ),
                  [key]: event.target.value,
                })
              }
            >
              <option value="">{tr("pipeline.all")}</option>
              {filters[key] &&
                !values.some(([value]) => value === filters[key]) && (
                  <option value={filters[key]}>
                    {filters[key] === "__missing__"
                      ? tr("pipeline.unspecified")
                      : filters[key]}
                  </option>
                )}
              {values.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

export function PipelineApp() {
  const { tr, locale } = useI18n();
  const [data, setData] = useState<PipelineData | null>(null);
  const [week, setWeek] = useState("");
  const [filters, setFilters] = useState(pipelineFilters);
  const [publishable, setPublishable] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError(false);
    void fetch(`/api/pipeline?week=${encodeURIComponent(week)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
          setData(result.data);
          setPublishable(result.publishable);
          setBusy(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [week, version]);

  const current =
    data?.current.filter((s) =>
      data.scope.some(
        (e) =>
          e.id === s.entityId &&
          (!filters.entity || e.id === filters.entity) &&
          (!filters.region || matchesRegion(e, filters.region)),
      ),
    ) ?? [];
  const rows = pipelineRows(current, filters);
  const keyIds = new Set(
    current
      .flatMap((s) => s.rows)
      .filter((r) => r.keyProject)
      .map(projectKey),
  );
  const keyRows = rows.filter((r) => keyIds.has(projectKey(r)));
  const asOf = current.reduce(
    (latest, source) => (source.asOf > latest ? source.asOf : latest),
    "",
  );
  const reference = current.flatMap((s) => s.rows);
  const movement = asOf ? pipelineProjectMovement(rows, asOf, reference) : null;
  const scopeText = current
    .map(
      (s) =>
        `${data?.scope.find((e) => e.id === s.entityId)?.code} · ${s.asOf}`,
    )
    .join(" / ");
  const chartContext = [
    scopeText,
    filters.team,
    filters.group,
    filters.customer,
  ]
    .filter(Boolean)
    .map((value) =>
      value === "__missing__" ? tr("pipeline.unspecified") : value,
    )
    .join(" · ");
  const number = new Intl.NumberFormat(locale);
  const income = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const month = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>{tr("pipeline.title")}</h1>
          <p>{tr("pipeline.subtitle")}</p>
        </div>
        {data && data.weeks.length > 0 && (
          <label className={styles.week}>
            {tr("pipeline.reportingWeek")}
            <select
              aria-label={tr("pipeline.reportingWeek")}
              value={week}
              onChange={(event) => setWeek(event.target.value)}
            >
              <option value="">{tr("pipeline.latest")}</option>
              {data.weeks.map((date) => (
                <option value={date} key={date}>
                  {weekLabel(date)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {publishable && (
        <PipelineImport
          onPublish={(next) => {
            setWeek(next);
            setVersion((value) => value + 1);
          }}
        />
      )}
      {error && (
        <div className={styles.panel} role="alert">
          {tr("pipeline.requestFailed")}{" "}
          <button
            className="apac-button"
            onClick={() => setVersion((value) => value + 1)}
          >
            {tr("common.retry")}
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className={styles.loading}>
          {tr("auth.updating")}
        </p>
      )}
      <div
        className={`dashboard-route ${styles.content}`}
        aria-busy={busy || error}
      >
        {data && data.current.length > 0 && (
          <FilterBar data={data} filters={filters} onChange={setFilters} />
        )}
        {data && !movement && (
          <p className={styles.panel}>
            {tr(data.weeks.length ? "pipeline.noScope" : "pipeline.noSnapshot")}
          </p>
        )}
        {movement && (
          <>
            <div className={styles.source}>
              <strong>{weekLabel(data!.week)}</strong>
              <span>{scopeText}</span>
              <span>
                {[...new Set(current.map((s) => s.fileName))].join(" / ")}
              </span>
            </div>
            <div className={styles.metrics}>
              {(
                [
                  ["pipeline.ytdAdded", "ytdAdded"],
                  ["pipeline.ytdLost", "ytdLost"],
                  ["pipeline.weekAdded", "weekAdded"],
                  ["pipeline.weekLost", "weekLost"],
                ] as const
              ).map(([title, key]) => {
                const value = movement.income[key];
                return (
                  <article key={title} className={styles.metric}>
                    <span>{tr(title)}</span>
                    <strong>{number.format(movement[key])}</strong>
                    <div className={styles.metricIncome}>
                      <b>
                        {value.kEUR === null ? "—" : income.format(value.kEUR)}{" "}
                        kEUR
                      </b>
                      {value.missing > 0 && (
                        <small>
                          {tr("pipeline.incomeMissing", {
                            count: value.missing,
                          })}
                        </small>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className={styles.note}>
              {tr("pipeline.incomeBasis", {
                rmb: income.format(pipelineFx.RMB),
                usd: income.format(pipelineFx.USD),
              })}
            </p>
            {movement.undatedLosses > 0 && (
              <p className={styles.note}>
                {tr("pipeline.undated", { count: movement.undatedLosses })}
              </p>
            )}
            <div className={styles.statusPanels}>
              <PipelineStatusPanel
                rows={rows}
                reference={reference}
                asOf={asOf}
                context={chartContext}
              />
              <PipelineStatusPanel
                rows={rows}
                reference={reference}
                asOf={asOf}
                context={chartContext}
                byStage
              />
            </div>
            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <h2>{tr("pipeline.monthComparison")}</h2>
                <span className={styles.status}>{tr("pipeline.added")}</span>
              </div>
              <div className={styles.months}>
                <div>
                  <span>
                    {month.format(
                      new Date(`${movement.priorMonth}-01T00:00:00Z`),
                    )}
                  </span>
                  <strong>{number.format(movement.priorMonthAdded)}</strong>
                </div>
                <div>
                  <span>
                    {month.format(new Date(`${movement.month}-01T00:00:00Z`))} ·{" "}
                    {tr("pipeline.monthToDate")}
                  </span>
                  <strong>{number.format(movement.monthAdded)}</strong>
                </div>
                <div>
                  <span>{tr("pipeline.monthDifference")}</span>
                  <strong>
                    {new Intl.NumberFormat(locale, {
                      signDisplay: "exceptZero",
                    }).format(movement.monthAdded - movement.priorMonthAdded)}
                  </strong>
                </div>
              </div>
              <p className={styles.note}>
                {tr("pipeline.monthLoss", {
                  now: movement.monthLost,
                  previous: movement.priorMonthLost,
                })}
              </p>
              <p className={styles.note}>{tr("pipeline.monthNote")}</p>
            </section>
            <PipelineTrend series={movement.trend} context={chartContext} />
            <section className={styles.panel}>
              <h2>{tr("pipeline.keyProjects")}</h2>
              {keyRows.length ? (
                <PipelineStatusSummary rows={keyRows} />
              ) : (
                <p className={styles.note}>{tr("pipeline.noKey")}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
