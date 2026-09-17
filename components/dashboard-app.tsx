"use client";
import { usePathname, useRouter } from "next/navigation";
import { loginDestination, pagePath, parsePagePath, type Page } from "@/lib/routes";
import { useI18n } from "@/components/i18n-provider";
import { matchesRegion } from "@/lib/entities";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImportPortal } from "@/components/import-portal";
import { AdminPanel } from "@/components/admin-panel";
import { PerformanceChart } from "@/components/performance-chart";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  defaultFilters,
  formatK,
  percent,
  months,
  combine,
} from "@/lib/dashboard";
import type { Dashboard, Metric } from "@/lib/dashboard";
import type { Amount, Filters, User } from "@/lib/types";
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="filter-field">
      <span className="filter-label">{label}</span>
      <div
        className="segmented"
        style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}
        role="group"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            aria-pressed={value === o.value}
            className={value === o.value ? "is-active" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function MetricCard({
  label,
  value,
  note,
  children,
  accent = false,
  unit = "kEUR",
  period,
  periodDetail,
}: {
  label: string;
  value: string;
  note: string;
  children?: React.ReactNode;
  accent?: boolean;
  unit?: "kEUR" | "FY";
  period?: string;
  periodDetail?: string;
}) {
  return (
    <article className={`kpi-card ${accent ? "kpi-accent" : ""}`}>
      <div className="kpi-topline">
        <span>{label}</span>
        <small>{unit}</small>
      </div>
      <div className="kpi-value-row">
        <strong>{value}</strong>
        {period && <span className="kpi-period">{period}<small>{periodDetail}</small></span>}
      </div>
      {children}
      <p>{note}</p>
    </article>
  );
}
function MetricsTable({
  rows,
  onSelect,
}: {
  rows: {
    id: string;
    name: string;
    description?: string;
    metrics: Metric;
    week?: number;
  }[];
  onSelect?: (id: string) => void;
}) {
  const { tr, display } = useI18n();
  return (
    <div className="table-wrap">
      <table className="bu-table">
        <thead>
          <tr>
            <th>{tr("common.buEntity")}</th>
            <th className="numeric">{tr("metric.budget")}</th>
            <th className="numeric">{tr("metric.base")}</th>
            <th className="numeric">{tr("metric.prospect")}</th>
            <th className="numeric">{tr("metric.scenario")}</th>
            <th className="numeric">{tr("metric.coverage")}</th>
            <th className="numeric">{tr("metric.gap")}</th>
            <th className="numeric">{tr("metric.remainingShort")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {onSelect ? (
                  <button
                    className="entity-link"
                    onClick={() => onSelect(r.id)}
                  >
                    {r.name}
                  </button>
                ) : (
                  <strong>{r.name}</strong>
                )}
                <small>
                  {r.description && display(r.description)}
                  {r.week ? ` · W${r.week}` : ""}
                </small>
              </td>
              <td className="numeric">{formatK(r.metrics.budget)}</td>
              <td className="numeric">{formatK(r.metrics.base)}</td>
              <td className="numeric">{formatK(r.metrics.prospect)}</td>
              <td className="numeric">
                {formatK(r.metrics.scenario)}
                {!r.metrics.scenarioComplete && (
                  <small>{tr("metric.partial")}</small>
                )}
              </td>
              <td className="numeric">
                {display(percent(r.metrics.coverage))}
              </td>
              <td className="numeric">{formatK(r.metrics.gap)}</td>
              <td className="numeric">{formatK(r.metrics.remaining)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function DashboardView({
  data,
  filters,
  setFilters,
}: {
  data: Dashboard;
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const { tr, display, locale } = useI18n();
  const [readiness, setReadiness] = useState(false),
    [frequency, setFrequency] = useState("month"),
    [matrixLevel, setMatrixLevel] = useState("entity"),
    [customer, setCustomer] = useState("all");
  const t = data.totals;
  const partial = (key: Dashboard["partialKeys"][number]) =>
    data.partialKeys.includes(key) ? tr("metric.partialSource") : "";
  const selectEntity = (id: string) =>
    setFilters({
      ...filters,
      region: "China",
      bu: id === "all" ? "all" : id.toUpperCase(),
      entity: id,
    });
  const totalRows = [
    {
      id: "china",
      name: tr("china.total"),
      description: tr("notes.sources", {
        count: data.china.filter((r) => r.snapshot).length,
        total: data.china.length,
      }),
      metrics: data.chinaTotal,
    },
    ...data.china.map((r) => ({
      id: r.entity.id,
      name: r.entity.code,
      description: r.entity.description,
      metrics: r.metrics,
      week: r.snapshot?.week,
    })),
  ];
  const matrixRows =
    matrixLevel === "entity"
      ? data.rows.map((r) => ({ name: r.entity.code, metrics: r.metrics }))
      : data.buGroups;
  const weeks = [
    ...new Set(data.history.flatMap((h) => h.records.map((r) => r.week))),
  ].sort((a, b) => a - b);
  const knownMix = (data.external ?? 0) + (data.group ?? 0);
  const externalShare = knownMix ? ((data.external ?? 0) / knownMix) * 100 : 0;
  return (
    <>
      <section className="executive-head" id="overview">
        <div>
          <p className="eyebrow">
            {tr("overview.performance")} {filters.year}
          </p>
          <h1>{tr("overview.salesYear", { year: filters.year })}</h1>
          <p className="executive-subtitle">{tr("overview.subtitle")}</p>
        </div>
        <div className="snapshot-wrapper">
          <button
            className="snapshot-cluster"
            onClick={() => setReadiness(!readiness)}
            aria-expanded={readiness}
          >
            <span className="snapshot-main">
              <span>{tr("snapshot.active")}</span>
              <strong>
                {data.weeks.length
                  ? data.weeks.map((w) => `W${w}`).join(" / ")
                  : tr("snapshot.none")}
              </strong>
            </span>
            <span className="snapshot-detail">
              <span>
                {data.weeks.length > 1
                  ? tr("snapshot.mixed")
                  : tr("snapshot.source")}{" "}
                · 2026
              </span>
              <span>
                EUR K · {tr("notes.revision", { revision: data.revision })}
              </span>
            </span>
            <span className="snapshot-readiness-compact">
              <strong>
                {tr("snapshot.count", {
                  count: data.sourceCount,
                  total: data.rows.length,
                })}
              </strong>
              <small>
                {tr("snapshot.checkCount", { count: data.checks.length })}
              </small>
              <strong>
                {tr("snapshot.prospectState", {
                  state:
                    t.prospect === null
                      ? tr("snapshot.pending")
                      : tr("snapshot.partial"),
                })}
              </strong>
            </span>
            <span>⌄</span>
          </button>
          {readiness && (
            <section className="snapshot-readiness-panel">
              <div className="readiness-panel-head">
                <h2>{tr("snapshot.readiness")}</h2>
                <button
                  className="readiness-close"
                  aria-label={tr("snapshot.close")}
                  onClick={() => setReadiness(false)}
                >
                  ×
                </button>
              </div>
              <div className="readiness-groups">
                {data.rows.map((r) => (
                  <div className="readiness-item" key={r.entity.id}>
                    <strong>
                      {r.entity.code} ·{" "}
                      {r.snapshot ? tr("common.review") : tr("common.missing")}
                    </strong>
                    <p>
                      {r.snapshot
                        ? `${r.snapshot.sourceFile} · ${r.snapshot.sourceSheet}`
                        : tr("snapshot.notSupplied")}
                    </p>
                    {r.snapshot && (
                      <details>
                        <summary>{tr("snapshot.details")}</summary>
                        <p>{r.snapshot.sourceNote}</p>
                        {Object.entries(r.snapshot.sourceCells).map(
                          ([key, value]) => (
                            <p key={key}>
                              {key}: {value}
                            </p>
                          ),
                        )}
                        <ul>
                          {r.snapshot.findings.map((f, i) => (
                            <li key={i}>{display(f)}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
      <section className="filter-bar" aria-label={tr("filters.global")}>
        <div className="filter-field">
          <label htmlFor="region">{tr("filters.region")}</label>
          <select
            id="region"
            value={filters.region}
            onChange={(e) =>
              setFilters({
                ...filters,
                region: e.target.value,
                bu: "all",
                entity: "all",
              })
            }
          >
            {data.regions.map((r) => (
              <option key={r} value={r}>
                {r === "APAC" ? tr("filters.apac") : display(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="bu">{tr("common.bu")}</label>
          <select
            id="bu"
            value={filters.bu}
            onChange={(e) =>
              setFilters({ ...filters, bu: e.target.value, entity: "all" })
            }
          >
            <option value="all">{tr("filters.allBU")}</option>
            {[
              ...new Set(
                data.entities
                  .filter((e) => matchesRegion(e, filters.region))
                  .map((e) => e.businessUnit),
              ),
            ].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="entity">{tr("common.entity")}</label>
          <select
            id="entity"
            value={filters.entity}
            onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
          >
            <option value="all">{tr("filters.allEntities")}</option>
            {data.entities
              .filter(
                (e) =>
                  matchesRegion(e, filters.region) &&
                  (filters.bu === "all" || e.businessUnit === filters.bu),
              )
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code}
                </option>
              ))}
          </select>
        </div>
        <Segmented
          label={tr("filters.years")}
          value={String(filters.year)}
          options={[
            { value: "2026", label: "2026" },
            { value: "2027", label: "2027" },
          ]}
          onChange={(v) => setFilters({ ...filters, year: Number(v) })}
        />
        <Segmented
          label={tr("filters.scenario")}
          value={filters.scenario}
          options={[
            { value: "Sales", label: tr("metric.sales") },
            { value: "Sales + Prospect", label: tr("metric.salesProspect") },
          ]}
          onChange={(v) =>
            setFilters({ ...filters, scenario: v as Filters["scenario"] })
          }
        />
        <Segmented
          label={tr("filters.type")}
          value={filters.salesType}
          options={[
            { value: "all", label: tr("filters.allSales") },
            { value: "external", label: tr("common.external") },
            { value: "group", label: tr("common.group") },
          ]}
          onChange={(v) =>
            setFilters({ ...filters, salesType: v as Filters["salesType"] })
          }
        />
      </section>
      <section className="china-strip" aria-label={tr("china.details")}>
        <button
          onClick={() => selectEntity("all")}
          className={
            filters.region === "China" &&
            filters.bu === "all" &&
            filters.entity === "all"
              ? "selected"
              : ""
          }
        >
          <small>
            {tr("china.totalUpper")}
            {filters.year}
          </small>
          <strong>
            {formatK(data.chinaTotal.base)} <em>kEUR</em>
          </strong>
          <span>{tr("china.known")}</span>
        </button>
        {data.china.map((r) => (
          <button
            key={r.entity.id}
            className={filters.entity === r.entity.id ? "selected" : ""}
            onClick={() => selectEntity(r.entity.id)}
          >
            <small>
              {r.entity.code} · {display(r.entity.description)}
            </small>
            <strong>
              {formatK(r.metrics.base)} <em>kEUR</em>
            </strong>
            <span>
              {r.snapshot
                ? `W${r.snapshot.week} · ${r.metrics.budget === null ? tr("china.budgetReview") : tr("china.sourceReview")}`
                : tr("china.pending")}
            </span>
          </button>
        ))}
      </section>
      {!data.rows.length && (
        <p className="apac-notice">{tr("overview.noData")}</p>
      )}
      <section className="kpi-grid" id="analysis">
        <MetricCard
          label={tr("metric.budget")}
          value={formatK(t.budget)}
          note={tr("notes.budget", {
            year: filters.year,
            note: t.budget === null ? tr("notes.missingBudget") : "",
          })}
        />
        <MetricCard
          label={tr("metric.baseOB")}
          value={formatK(t.base)}
          note={tr("notes.base", { note: partial("base") })}
        >
          <div className="kpi-sales-split">
            <div>
              <span>{tr("metric.salesDate")}</span>
              <strong>{formatK(t.sales)}</strong>
            </div>
            <div>
              <span>{tr("metric.ob")}</span>
              <strong>{formatK(t.orderbook)}</strong>
            </div>
          </div>
          <small>{tr("metric.unsplit")}</small>
        </MetricCard>
        <MetricCard
          label={tr("metric.salesProspect")}
          value={formatK(t.scenario)}
          accent
          note={`${filters.scenario === "Sales" ? tr("metric.salesSelected") : tr("metric.expected")}${partial("scenario")}`}
        >
          <div className="kpi-sales-split">
            <div>
              <span>{tr("metric.knownProspect")}</span>
              <strong>{formatK(t.prospect)}</strong>
            </div>
          </div>
        </MetricCard>
        <MetricCard
          label={tr("metric.coverage")}
          period={tr("metric.byYear")}
          periodDetail={String(filters.year)}
          unit="FY"
          value={display(percent(t.coverage))}
          note={tr("notes.coverage", { year: filters.year })}
        >
          <div className="kpi-meter">
            <span
              style={{ width: `${Math.min(100, (t.coverage ?? 0) * 100)}%` }}
            />
          </div>
        </MetricCard>
        <MetricCard
          label={tr("metric.gapTitle")}
          period={tr("metric.byYear")}
          periodDetail={String(filters.year)}
          value={formatK(t.gap)}
          note={tr("notes.gap", {
            year: filters.year,
            note: t.gap === null ? tr("notes.reviewSuffix") : "",
          })}
        />
        <MetricCard
          label={tr("metric.remaining")}
          period={tr("metric.byMonth")}
          periodDetail={Array.from(new Set(data.rows.flatMap(r => r.snapshot && r.metrics.remaining !== null ? [`${display(months[r.snapshot.month - 1])} ${r.snapshot.year}`] : []))).join(" / ")}
          value={formatK(t.remaining)}
          note={tr("notes.remaining", {
            note: partial("remaining"),
            future: filters.year === 2027 ? tr("notes.future") : "",
          })}
        />
      </section>
      <section className="briefing-strip">
        <div className="briefing-title">
          <span className="briefing-mark">↗</span>
          <div>
            <p>{tr("overview.summary")}</p>
            <h2>{tr("overview.attention")}</h2>
          </div>
        </div>
        <div className="briefing-points">
          <span>
            <b>{data.rows.filter((r) => r.metrics.budget === null).length}</b>{" "}
            {tr("overview.budgetsMissing")}
          </span>
          <span>
            <b>{data.rows.filter((r) => r.metrics.prospect === null).length}</b>{" "}
            {tr("overview.prospectPending")}
          </span>
          <span>
            {data.partialKeys.length
              ? tr("overview.partial")
              : tr("overview.available")}{" "}
            ·{" "}
            {data.weeks.length > 1
              ? tr("overview.mixed")
              : tr("overview.weekly")}
          </span>
        </div>
      </section>
      <section className="dashboard-grid dashboard-grid-main">
        <article className="panel cumulative-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">{tr("chart.trajectory")}</p>
              <h2>{tr("chart.cumulativeTitle")}</h2>
              <p>
                {filters.bu === "all" ? tr("filters.allBU") : filters.bu} ·{" "}
                {filters.year} ·{" "}
                {filters.salesType === "all"
                  ? tr("filters.allSales")
                  : display(filters.salesType)}
              </p>
            </div>
          </div>
          <PerformanceChart rows={t.cumulative} cumulative />
          <div className="panel-foot">
            <span>
              {tr("notes.annualScenario", {
                scenario: formatK(t.scenario),
                gap: formatK(t.gap),
              })}
            </span>
            <span className="source-note">{tr("chart.anchor")}</span>
          </div>
          <details className="analysis-disclosure">
            <summary>
              <span>
                <strong>{tr("chart.compare")}</strong>
                <small>{tr("chart.compareNote")}</small>
              </span>
              <span className="disclosure-action">{tr("chart.explore")}</span>
            </summary>
            <div className="analysis-disclosure-body comparison-grid">
              {data.rows.map((r) => (
                <section key={r.entity.id}>
                  <h3>{r.entity.code}</h3>
                  <PerformanceChart rows={r.metrics.cumulative} cumulative />
                </section>
              ))}
            </div>
          </details>
        </article>
        <article className="panel gap-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">{tr("chart.contribution")}</p>
              <h2>{tr("chart.gapBU")}</h2>
            </div>
          </div>
          <div className="gap-list">
            {data.buGroups.map((b) => (
              <div className="apac-gap-row" key={b.name}>
                <strong>{b.name}</strong>
                <div>
                  <i
                    style={{
                      width:
                        b.metrics.gap === null
                          ? "0%"
                          : `${Math.min(100, (Math.abs(b.metrics.gap) / Math.max(b.metrics.budget ?? 1, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <b>
                  {b.metrics.gap === null
                    ? tr("common.review")
                    : formatK(b.metrics.gap)}
                </b>
              </div>
            ))}
          </div>
          <div className="gap-callout">
            <span>{tr("chart.annualGap")}</span>
            <strong>{formatK(t.gap)}</strong>
          </div>
          <div className="sales-mix-block">
            <div className="sales-mix-heading">
              <div>
                <span>{tr("chart.mix")}</span>
                <strong>{tr("chart.externalGroup")}</strong>
              </div>
              <small>{tr("chart.classified")}</small>
            </div>
            <div className="apac-mix">
              <div
                className="apac-donut"
                style={{
                  background: knownMix
                    ? `conic-gradient(#a77a35 0 ${externalShare}%, #386b65 ${externalShare}% 100%)`
                    : "#ded9ce",
                }}
              >
                <span>
                  {knownMix ? `${externalShare.toFixed(0)}%` : "—"}
                  <small>{tr("common.external")}</small>
                </span>
              </div>
              <div>
                <p>
                  {tr("common.external")}
                  <b>{formatK(data.external)}</b>
                </p>
                <p>
                  {tr("common.group")}
                  <b>{formatK(data.group)}</b>
                </p>
                <small>{tr("chart.dcpSplit")}</small>
              </div>
            </div>
          </div>
        </article>
      </section>
      <section className="dashboard-grid dashboard-grid-secondary">
        <article className="panel monthly-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">{tr("chart.monthly")}</p>
              <h2>{tr("chart.monthlyTitle")}</h2>
              <p>{tr("chart.phasing")}</p>
            </div>
          </div>
          <PerformanceChart rows={t.monthly} />
        </article>
        <article className="panel weekly-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">{tr("chart.control")}</p>
              <h2>{tr("chart.invoice")}</h2>
              <p>
                {[
                  ...new Set(
                    data.rows.flatMap((r) =>
                      r.snapshot && r.metrics.monthEstimate !== null
                        ? [display(months[r.snapshot.month - 1])]
                        : [],
                    ),
                  ),
                ].join(" / ")}{" "}
                {tr("chart.sourceMonth")}
              </p>
            </div>
          </div>
          <div className="apac-delivery">
            <strong>
              {formatK(t.monthSales)}
              <small>{tr("chart.mtd")}</small>
            </strong>
            <span>
              {tr("notes.estimate", { amount: formatK(t.monthEstimate) })}
            </span>
            <div className="delivery-track">
              <i
                style={{
                  width: `${t.monthEstimate ? Math.min(100, ((t.monthSales ?? 0) / t.monthEstimate) * 100) : 0}%`,
                }}
              />
            </div>
            <p>
              {tr("chart.stillInvoice")}
              <b>{formatK(t.remaining)} kEUR</b>
            </p>
          </div>
          <div className="panel-foot">
            <span>{tr("chart.monthNote")}</span>
            <span className="source-note">{tr("chart.partialMonth")}</span>
          </div>
        </article>
      </section>
      <section className="panel commercial-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">{tr("commercial.exposure")}</p>
            <h2>{tr("commercial.title")}</h2>
            <p>{tr("commercial.largest")}</p>
          </div>
          <label className="commercial-filter">
            <span>{tr("common.customer")}</span>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="all">{tr("filters.allAvailable")}</option>
              {data.commercial.map((c) => (
                <option key={c.customer}>{c.customer}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="commercial-grid">
          {data.commercial
            .filter((c) => customer === "all" || c.customer === customer)
            .slice(0, 8)
            .map((c) => (
              <div className="apac-commercial" key={c.customer}>
                <span>{c.customer}</span>
                <strong>
                  {formatK(c.value)} <small>kEUR</small>
                </strong>
                <div>
                  <i
                    style={{
                      width: `${Math.max(0, (c.value / Math.max(data.commercial[0]?.value ?? 1, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
        </div>
        {!data.commercial.length && (
          <p className="muted">{tr("commercial.empty")}</p>
        )}
        <div className="panel-foot">{tr("commercial.note")}</div>
      </section>
      <section className="panel matrix-panel" id="time-matrix">
        <details open>
          <summary>
            <span>
              <p className="panel-kicker">{tr("matrix.period")}</p>
              <h2>{tr("matrix.title")}</h2>
              <small>{tr("matrix.subtitle")}</small>
            </span>
            <span className="disclosure-action">{tr("matrix.explore")}</span>
          </summary>
          <div className="matrix-body">
            <div className="analysis-toolbar matrix-toolbar">
              <Segmented
                label={tr("matrix.frequency")}
                value={frequency}
                options={[
                  { value: "month", label: tr("common.month") },
                  { value: "week", label: tr("common.week") },
                ]}
                onChange={setFrequency}
              />
              <Segmented
                label={tr("matrix.rows")}
                value={matrixLevel}
                options={[
                  { value: "entity", label: tr("common.entities") },
                  { value: "bu", label: tr("common.bus") },
                ]}
                onChange={setMatrixLevel}
              />
              <p>
                {filters.year} · {display(filters.scenario)}
              </p>
            </div>
            <div className="matrix-scroll">
              <table className="time-matrix">
                <thead>
                  <tr>
                    <th>{tr("common.buEntity")}</th>
                    {(frequency === "month"
                      ? months
                      : weeks.map((w) => `W${w}`)
                    ).map((m) => (
                      <th className="numeric" key={m}>
                        {display(m)}
                      </th>
                    ))}
                    <th className="numeric">{tr("matrix.fy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      {frequency === "month"
                        ? r.metrics.monthly.map((m) => (
                            <td className="numeric" key={m.label}>
                              {formatK(m.scenario)}
                            </td>
                          ))
                        : weeks.map((w) => {
                            const history = data.history.filter((h) =>
                              matrixLevel === "entity"
                                ? h.entity.code === r.name
                                : h.entity.businessUnit === r.name,
                            );
                            const vals = history.map(
                              (h) =>
                                h.records.find((x) => x.week === w)?.value ??
                                null,
                            );
                            return (
                              <td className="numeric" key={w}>
                                {formatK(
                                  vals.length && vals.every((v) => v !== null)
                                    ? vals.reduce<number>((a, v) => a + v!, 0)
                                    : null,
                                )}
                              </td>
                            );
                          })}
                      <td className="numeric">{formatK(r.metrics.scenario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">{tr("matrix.note")}</p>
          </div>
        </details>
      </section>
      <section className="panel bu-panel" id="business-units">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">{tr("china.entityDetail")}</p>
            <h2>{tr("china.details")}</h2>
            <p>{tr("china.note")}</p>
          </div>
        </div>
        <MetricsTable
          rows={totalRows}
          onSelect={(id) => selectEntity(id === "china" ? "all" : id)}
        />
        {data.rows.some((r) => r.entity.reportingRegion !== "China") && (
          <MetricsTable
            rows={data.rows
              .filter((r) => r.entity.reportingRegion !== "China")
              .map((r) => ({
                id: r.entity.id,
                name: r.entity.code,
                metrics: r.metrics,
              }))}
          />
        )}
      </section>
      <section className="quality-panel" id="management-checks">
        <details open>
          <summary>
            <div>
              <p className="panel-kicker">{tr("checks.controls")}</p>
              <h2>{tr("nav.checks")}</h2>
            </div>
            <span>{tr("checks.count", { count: data.checks.length })}</span>
          </summary>
          <p className="quality-intro">{tr("checks.note")}</p>
          <div className="quality-grid">
            {data.rows.map((r) => (
              <article className="apac-check" key={r.entity.id}>
                <strong>
                  {r.entity.code} ·{" "}
                  {r.snapshot ? tr("common.review") : tr("snapshot.missing")}
                </strong>
                <ul>
                  {(
                    r.snapshot?.findings ?? [tr("snapshot.workbookMissing")]
                  ).map((f, i) => (
                    <li key={i}>{display(f)}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </details>
      </section>
      <footer className="apac-footer">
        <span>{tr("footer.title")}</span>
        <span>
          {data.latestPublish
            ? tr("notes.lastPublish", {
                date: new Date(data.latestPublish).toLocaleString(locale),
              })
            : tr("snapshot.baseline")}{" "}
          · kEUR
        </span>
      </footer>
    </>
  );
}
export default function Home() {
  const { tr, display, locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const route = parsePagePath(pathname);
  const view = route?.page ?? "overview";
  const setView = (page: Page) => router.push(pagePath(locale, page));
  const [user, setUser] = useState<User | null>(null),
    [sessionChecked, setSessionChecked] = useState(false),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [writable, setWritable] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setUser(j.user);
      })
      .finally(() => setSessionChecked(true));
  }, []);
  useEffect(() => {
    if (!sessionChecked || !parsePagePath(pathname)) return;
    if (!user && view !== "login") {
      router.replace(`${pagePath(locale, "login")}?next=${encodeURIComponent(pathname + window.location.search + window.location.hash)}`);
    } else if (user && view === "login") {
      router.replace(loginDestination(new URLSearchParams(window.location.search).get("next"), locale));
    }
  }, [sessionChecked, user, view, pathname, locale, router]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    const query = new URLSearchParams(
      Object.entries(filters).map(([k, v]) => [k, String(v)]),
    );
    void fetch(`/api/dashboard?${query}`, { signal: controller.signal })
      .then((r) => {
        if (r.status === 401) {
          setUser(null);
          setData(null);
        }
        return r.json();
      })
      .then((j) => {
        if (!j.ok) throw new Error(j.error);
        setData(j.data);
        setWritable(j.storage.writable);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user, filters, revision]);
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const j = await (
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      setUser(j.user);
      setPassword("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    await fetch("/api/auth/login", { method: "DELETE" });
    setUser(null);
    setData(null);
    router.replace(pagePath(locale, "login"));
  };
  if (!route) return null;
  if (!sessionChecked)
    return <main className="login-shell">{tr("auth.loading")}</main>;
  if (!user || view === "login")
    return (
      <main className="login-shell">
        <div className="login-language">
          <LanguageSwitcher />
        </div>
        <form className="panel login-panel" onSubmit={(e) => void login(e)}>
          <img src="/diam-logo.png" alt="DIAM" width="100" />
          <p className="panel-kicker">{tr("auth.performance")}</p>
          <h1>{tr("auth.signIn")}</h1>
          <p>{tr("auth.access")}</p>
          <label>
            {tr("common.email")}
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {tr("common.password")}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="apac-button primary" disabled={loading}>
            {tr("auth.signIn")}
          </button>
          {error && (
            <p role="alert" className="error-message">
              {display(error)}
            </p>
          )}
        </form>
      </main>
    );
  return (
    <DashboardShell
      user={user}
      filters={filters}
      onLogout={() => void logout()}
      page={view}
    >
      <main className="page-shell">
        {error && (
          <p className="apac-notice" role="alert">
            {display(error)}
          </p>
        )}
        {loading && (
          <div className="loading-strip" role="status">
            {tr("auth.updating")}
          </div>
        )}
        {(view === "admin" && user.role !== "superadmin") || (view === "imports" && !["superadmin", "region_admin", "editor"].includes(user.role)) ? (
          <p role="alert">{tr("common.noAccess")}</p>
        ) : view === "imports" ? (
          <ImportPortal
            currentUser={user}
            writable={writable}
            onClose={() => setView("overview")}
            onPublished={() => setRevision((v) => v + 1)}
          />
        ) : view === "admin" ? (
          <AdminPanel onClose={() => setView("overview")} />
        ) : view === "brand" ? (
          <section className="panel apac-workspace">
            <p className="panel-kicker">{tr("brand.title")}</p>
            <h1>{tr("brand.pending")}</h1>
            <p>{tr("brand.note")}</p>
            <button className="apac-button" onClick={() => setView("overview")}>
              {tr("common.backOverview")}
            </button>
          </section>
        ) : data ? (
          <div
            aria-busy={loading}
            className={`dashboard-route dashboard-route-${view} ${loading ? "dashboard-updating" : ""}`}
          >
            <DashboardView
              data={data}
              filters={filters}
              setFilters={setFilters}
            />
          </div>
        ) : (
          <p>{tr("auth.dashboardLoading")}</p>
        )}
      </main>
    </DashboardShell>
  );
}
