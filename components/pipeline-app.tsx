"use client";

import { useEffect, useState } from "react";
import { matchesRegion, regions } from "@/lib/entities";
import type { MessageKey } from "@/lib/i18n";
import {
  pipelineCurrencies,
  pipelineFilters,
  pipelineMovement,
  pipelineRows,
  pipelineStatuses,
  pipelineTotals,
  weekLabel,
  type Opportunity,
  type PipelineData,
  type PipelineFilters,
  type PipelineStatus,
} from "@/lib/pipeline";
import { useI18n } from "./i18n-provider";
import { PipelineImport } from "./pipeline-import";
import { PipelineTrend } from "./pipeline-trend";
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

function StatusTable({
  rows,
  earlier,
}: {
  rows: Opportunity[];
  earlier?: Opportunity[];
}) {
  const { tr, locale } = useI18n();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const delta = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  });
  const render = (
    amount: number | null,
    previous: number | null | undefined,
  ) => (
    <>
      {amount === null ? "—" : number.format(amount)}
      {amount !== null && typeof previous === "number" && (
        <small>
          {tr("pipeline.delta", { delta: delta.format(amount - previous) })}
        </small>
      )}
    </>
  );
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{tr("pipeline.status")}</th>
            <th scope="col">{tr("pipeline.projects")}</th>
            <th scope="col">{tr("pipeline.opportunities")}</th>
            {pipelineCurrencies.map((currency) => (
              <th key={currency} scope="col">
                {currency}
              </th>
            ))}
            <th scope="col">{tr("pipeline.withoutAmount")}</th>
          </tr>
        </thead>
        <tbody>
          {(["total", ...pipelineStatuses] as const).map((status) => {
            const select = (data: Opportunity[]) =>
              status === "total"
                ? data
                : data.filter((row) => row.status === status);
            const current = pipelineTotals(select(rows));
            const previous = earlier && pipelineTotals(select(earlier));
            return (
              <tr key={status}>
                <th scope="row">{tr(`pipeline.status.${status}`)}</th>
                <td>{render(current.projects, previous?.projects)}</td>
                <td>
                  {render(current.opportunities, previous?.opportunities)}
                </td>
                {pipelineCurrencies.map((currency) => (
                  <td key={currency}>
                    {render(
                      current.amounts[currency],
                      previous?.amounts[currency],
                    )}
                  </td>
                ))}
                <td>{number.format(current.withoutAmount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpportunityTable({
  rows,
  sources,
}: {
  rows: Opportunity[];
  sources: PipelineData["current"];
}) {
  const { tr, locale } = useI18n();
  const [status, setStatus] = useState<"" | PipelineStatus>("");
  const [page, setPage] = useState(0);
  const items = status ? rows.filter((row) => row.status === status) : rows;
  const pageSize = 20;
  const count = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(count - 1, page);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>{tr("pipeline.details")}</h2>
        <label>
          {tr("pipeline.status")}{" "}
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(0);
            }}
          >
            <option value="">{tr("pipeline.all")}</option>
            {pipelineStatuses.map((item) => (
              <option value={item} key={item}>
                {tr(`pipeline.status.${item}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label={tr("pipeline.details")}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              {(
                [
                  "pipeline.opportunity",
                  "common.entity",
                  "pipeline.salesTeam",
                  "ar.customerGroup",
                  "common.customer",
                  "pipeline.status",
                  "pipeline.stage",
                  "pipeline.estimated",
                  "pipeline.created",
                ] as const
              ).map((key) => (
                <th scope="col" key={key}>
                  {tr(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items
              .slice(current * pageSize, (current + 1) * pageSize)
              .map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.name}
                    <small>
                      {row.id} · {row.project}
                    </small>
                  </th>
                  <td>
                    {row.entityId === "dhk"
                      ? "DEHK"
                      : row.entityId.toUpperCase()}
                  </td>
                  <td>{row.team || "—"}</td>
                  <td>{row.customerGroup || "—"}</td>
                  <td>{row.customer || "—"}</td>
                  <td>{tr(`pipeline.status.${row.status}`)}</td>
                  <td>{row.stage ? tr(`pipeline.stage.${row.stage}`) : "—"}</td>
                  <td>
                    {row.amount === null
                      ? "—"
                      : `${row.currency} ${number.format(row.amount)}`}
                  </td>
                  <td>
                    {row.created}
                    <small>
                      {sources.find((s) => s.entityId === row.entityId)?.sheet}{" "}
                      · {row.sourceRow}
                    </small>
                  </td>
                </tr>
              ))}
            {!items.length && (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  {tr("pipeline.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {count > 1 && (
        <div className={styles.pagination}>
          <button
            className="apac-button"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            {tr("pipeline.previous")}
          </button>
          <span>
            {current + 1} / {count}
          </span>
          <button
            className="apac-button"
            disabled={current + 1 >= count}
            onClick={() => setPage(current + 1)}
          >
            {tr("pipeline.next")}
          </button>
        </div>
      )}
    </section>
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
      .map((r) => r.project),
  );
  const keyRows = rows.filter((r) => keyIds.has(r.project));
  const asOf = current.reduce(
    (latest, source) => (source.asOf > latest ? source.asOf : latest),
    "",
  );
  const movement = asOf ? pipelineMovement(rows, asOf) : null;
  const earlier =
    data?.previous.filter((s) =>
      current.some((c) => c.entityId === s.entityId),
    ) ?? [];
  const comparable = Boolean(
    current.length &&
    earlier.length === current.length &&
    current.every((s) => s.asOf.slice(0, 7) === movement?.month),
  );
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
                  ["pipeline.ytdAdded", movement.ytdAdded],
                  ["pipeline.ytdLost", movement.ytdLost],
                  ["pipeline.weekAdded", movement.weekAdded],
                  ["pipeline.weekLost", movement.weekLost],
                ] as const
              ).map(([title, value]) => (
                <article key={title} className={styles.metric}>
                  <span>{tr(title)}</span>
                  <strong>{number.format(value)}</strong>
                </article>
              ))}
            </div>
            {movement.undatedLosses > 0 && (
              <p className={styles.note}>
                {tr("pipeline.undated", { count: movement.undatedLosses })}
              </p>
            )}
            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <h2>{tr("pipeline.weeklyStatus")}</h2>
                <span className={styles.status}>
                  {tr("pipeline.estimated")}
                </span>
              </div>
              <StatusTable
                rows={rows}
                earlier={
                  comparable ? pipelineRows(earlier, filters) : undefined
                }
              />
              <p className={styles.note}>{tr("pipeline.grainNote")}</p>
              <p className={styles.note}>
                {comparable
                  ? tr("pipeline.compared", {
                      dates: earlier.map((source) => source.asOf).join(" / "),
                    })
                  : tr("pipeline.noComparison")}
              </p>
            </section>
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
                <StatusTable rows={keyRows} />
              ) : (
                <p className={styles.note}>{tr("pipeline.noKey")}</p>
              )}
            </section>
            <OpportunityTable
              key={JSON.stringify([data?.week, filters])}
              rows={rows}
              sources={current}
            />
          </>
        )}
      </div>
    </div>
  );
}
