"use client";
import { matchesRegion } from "@/lib/entities";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ImportPortal } from "@/components/import-portal";
import { AdminPanel } from "@/components/admin-panel";
import { PerformanceChart } from "@/components/performance-chart";
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
}: {
  label: string;
  value: string;
  note: string;
  children?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`kpi-card ${accent ? "kpi-accent" : ""}`}>
      <div className="kpi-topline">
        <span>{label}</span>
        <small>{label === "Coverage" ? "FY" : "kEUR"}</small>
      </div>
      <strong>{value}</strong>
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
  return (
    <div className="table-wrap">
      <table className="bu-table">
        <thead>
          <tr>
            <th>BU / Entity</th>
            <th className="numeric">Annual Dashboard</th>
            <th className="numeric">Sales & Dashboard</th>
            <th className="numeric">Prospect</th>
            <th className="numeric">Selected scenario</th>
            <th className="numeric">Coverage</th>
            <th className="numeric">Residual gap</th>
            <th className="numeric">Remaining · month</th>
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
                  {r.description}
                  {r.week ? ` · W${r.week}` : ""}
                </small>
              </td>
              <td className="numeric">{formatK(r.metrics.budget)}</td>
              <td className="numeric">{formatK(r.metrics.base)}</td>
              <td className="numeric">{formatK(r.metrics.prospect)}</td>
              <td className="numeric">
                {formatK(r.metrics.scenario)}
                {!r.metrics.scenarioComplete && (
                  <small>Partial · Prospect/source pending</small>
                )}
              </td>
              <td className="numeric">{percent(r.metrics.coverage)}</td>
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
  const [readiness, setReadiness] = useState(false),
    [frequency, setFrequency] = useState("month"),
    [matrixLevel, setMatrixLevel] = useState("entity"),
    [customer, setCustomer] = useState("all");
  const t = data.totals;
  const partial = (key: Dashboard["partialKeys"][number]) =>
    data.partialKeys.includes(key) ? " · partial source coverage" : "";
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
      name: "China total",
      description: `${data.china.filter((r) => r.snapshot).length}/${data.china.length} sources · known values`,
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
          <p className="eyebrow">Business performance · {filters.year}</p>
          <h1>Sales {filters.year}</h1>
          <p className="executive-subtitle">
            A weekly and monthly view of Annual Dashboard, Sales and Prospect by
            BU and Entity.
          </p>
        </div>
        <div className="snapshot-wrapper">
          <button
            className="snapshot-cluster"
            onClick={() => setReadiness(!readiness)}
            aria-expanded={readiness}
          >
            <span className="snapshot-main">
              <span>Active snapshot</span>
              <strong>
                {data.weeks.length
                  ? data.weeks.map((w) => `W${w}`).join(" / ")
                  : "No source"}
              </strong>
            </span>
            <span className="snapshot-detail">
              <span>
                {data.weeks.length > 1
                  ? "Mixed source weeks"
                  : "Source snapshot"}{" "}
                · 2026
              </span>
              <span>EUR K · revision {data.revision}</span>
            </span>
            <span className="snapshot-readiness-compact">
              <strong>
                {data.sourceCount}/{data.rows.length} sources available
              </strong>
              <small>{data.checks.length} source checks</small>
              <strong>
                Prospect {t.prospect === null ? "pending" : "partly supplied"}
              </strong>
            </span>
            <span>⌄</span>
          </button>
          {readiness && (
            <section className="snapshot-readiness-panel">
              <div className="readiness-panel-head">
                <h2>Data readiness</h2>
                <button
                  className="readiness-close"
                  aria-label="Close data readiness"
                  onClick={() => setReadiness(false)}
                >
                  ×
                </button>
              </div>
              <div className="readiness-groups">
                {data.rows.map((r) => (
                  <div className="readiness-item" key={r.entity.id}>
                    <strong>
                      {r.entity.code} · {r.snapshot ? "Review" : "Missing"}
                    </strong>
                    <p>
                      {r.snapshot
                        ? `${r.snapshot.sourceFile} · ${r.snapshot.sourceSheet}`
                        : "Source not supplied"}
                    </p>
                    {r.snapshot && (
                      <details>
                        <summary>Show source details</summary>
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
                            <li key={i}>{f}</li>
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
      <section className="filter-bar" aria-label="Global filters">
        <div className="filter-field">
          <label htmlFor="region">Region</label>
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
                {r === "APAC" ? "APAC (Total)" : r}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="bu">Business Unit</label>
          <select
            id="bu"
            value={filters.bu}
            onChange={(e) =>
              setFilters({ ...filters, bu: e.target.value, entity: "all" })
            }
          >
            <option value="all">All BUs</option>
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
          <label htmlFor="entity">Entity</label>
          <select
            id="entity"
            value={filters.entity}
            onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
          >
            <option value="all">All entities</option>
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
          label="Analysis years"
          value={String(filters.year)}
          options={[
            { value: "2026", label: "2026" },
            { value: "2027", label: "2027" },
          ]}
          onChange={(v) => setFilters({ ...filters, year: Number(v) })}
        />
        <Segmented
          label="Scenario"
          value={filters.scenario}
          options={[
            { value: "Sales", label: "Sales" },
            { value: "Sales + Prospect", label: "Sales + Prospect" },
          ]}
          onChange={(v) =>
            setFilters({ ...filters, scenario: v as Filters["scenario"] })
          }
        />
        <Segmented
          label="Sales type"
          value={filters.salesType}
          options={[
            { value: "all", label: "All sales" },
            { value: "external", label: "External" },
            { value: "group", label: "Group" },
          ]}
          onChange={(v) =>
            setFilters({ ...filters, salesType: v as Filters["salesType"] })
          }
        />
      </section>
      <section className="china-strip" aria-label="China total and entities">
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
          <small>CHINA TOTAL · {filters.year}</small>
          <strong>
            {formatK(data.chinaTotal.base)} <em>kEUR</em>
          </strong>
          <span>Sales & Dashboard · known sources</span>
        </button>
        {data.china.map((r) => (
          <button
            key={r.entity.id}
            className={filters.entity === r.entity.id ? "selected" : ""}
            onClick={() => selectEntity(r.entity.id)}
          >
            <small>
              {r.entity.code} · {r.entity.description}
            </small>
            <strong>
              {formatK(r.metrics.base)} <em>kEUR</em>
            </strong>
            <span>
              {r.snapshot
                ? `W${r.snapshot.week} · ${r.metrics.budget === null ? "Budget review" : "Source review"}`
                : "Source pending"}
            </span>
          </button>
        ))}
      </section>
      {!data.rows.length && (
        <p className="apac-notice">
          No permitted source data for this selection. Choose APAC or China to
          view available records.
        </p>
      )}
      <section className="kpi-grid">
        <MetricCard
          label="Annual Dashboard"
          value={formatK(t.budget)}
          note={`Approved annual budget ${filters.year}${t.budget === null ? " · Review missing budgets" : ""}`}
        />
        <MetricCard
          label="Sales & Dashboard (OB)"
          value={formatK(t.base)}
          note={`YTD invoiced + committed annual OB${partial("base")}`}
        >
          <div className="kpi-sales-split">
            <div>
              <span>Sales to date</span>
              <strong>{formatK(t.sales)}</strong>
            </div>
            <div>
              <span>Dashboard (OB)</span>
              <strong>{formatK(t.orderbook)}</strong>
            </div>
          </div>
          <small>Split excludes unsplit legacy DCP data</small>
        </MetricCard>
        <MetricCard
          label="Sales + Prospect"
          value={formatK(t.scenario)}
          accent
          note={`${filters.scenario === "Sales" ? "Sales scenario selected" : "Expected annual sales including Prospect"}${partial("scenario")}`}
        >
          <div className="kpi-sales-split">
            <div>
              <span>Known Prospect</span>
              <strong>{formatK(t.prospect)}</strong>
            </div>
          </div>
        </MetricCard>
        <MetricCard
          label="Coverage"
          value={percent(t.coverage)}
          note={`Selected annual scenario / approved annual budget ${filters.year}`}
        >
          <div className="kpi-meter">
            <span
              style={{ width: `${Math.min(100, (t.coverage ?? 0) * 100)}%` }}
            />
          </div>
        </MetricCard>
        <MetricCard
          label="Residual Gap"
          value={formatK(t.gap)}
          note={`Annual budget less selected scenario · ${filters.year}${t.gap === null ? " · Review" : ""}`}
        />
        <MetricCard
          label="Remaining this month"
          value={formatK(t.remaining)}
          note={`Full-month estimate less MTD invoiced${partial("remaining")}${filters.year === 2027 ? " · future year unavailable" : ""}`}
        />
      </section>
      <section className="briefing-strip">
        <div className="briefing-title">
          <span className="briefing-mark">↗</span>
          <div>
            <p>Executive summary</p>
            <h2>What requires attention this week</h2>
          </div>
        </div>
        <div className="briefing-points">
          <span>
            <b>{data.rows.filter((r) => r.metrics.budget === null).length}</b>{" "}
            annual budgets unavailable
          </span>
          <span>
            <b>{data.rows.filter((r) => r.metrics.prospect === null).length}</b>{" "}
            Prospect inputs pending
          </span>
          <span>
            {data.partialKeys.length
              ? "Partial totals: known source values only"
              : "Source values available"}{" "}
            ·{" "}
            {data.weeks.length > 1
              ? "mixed reporting weeks"
              : "weekly snapshot"}
          </span>
        </div>
      </section>
      <section className="dashboard-grid dashboard-grid-main">
        <article className="panel cumulative-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Annual trajectory · EUR K</p>
              <h2>Annual Dashboard vs cumulative scenario</h2>
              <p>
                {filters.bu} · {filters.year} · {filters.salesType}
              </p>
            </div>
          </div>
          <PerformanceChart rows={t.cumulative} cumulative />
          <div className="panel-foot">
            <span>
              Annual selected scenario {formatK(t.scenario)} kEUR · gap{" "}
              {formatK(t.gap)} kEUR
            </span>
            <span className="source-note">
              Current YTD anchor + monthly committed orders. Missing Prospect
              phasing remains blank.
            </span>
          </div>
          <details className="analysis-disclosure">
            <summary>
              <span>
                <strong>Compare performance</strong>
                <small>Annual scenario for each Business Unit Entity</small>
              </span>
              <span className="disclosure-action">Explore comparison →</span>
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
              <p className="panel-kicker">Contribution to performance</p>
              <h2>Gap by BU</h2>
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
                  {b.metrics.gap === null ? "Review" : formatK(b.metrics.gap)}
                </b>
              </div>
            ))}
          </div>
          <div className="gap-callout">
            <span>Selected annual gap</span>
            <strong>{formatK(t.gap)}</strong>
          </div>
          <div className="sales-mix-block">
            <div className="sales-mix-heading">
              <div>
                <span>Sales mix</span>
                <strong>External vs Group</strong>
              </div>
              <small>Known classified source values</small>
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
                  <small>External</small>
                </span>
              </div>
              <div>
                <p>
                  External <b>{formatK(data.external)}</b>
                </p>
                <p>
                  Group <b>{formatK(data.group)}</b>
                </p>
                <small>DCP aggregate has no supplied split.</small>
              </div>
            </div>
          </div>
        </article>
      </section>
      <section className="dashboard-grid dashboard-grid-secondary">
        <article className="panel monthly-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Monthly phasing · EUR K</p>
              <h2>Annual Dashboard vs monthly performance</h2>
              <p>Sales and Prospect follow supplied monthly phasing</p>
            </div>
          </div>
          <PerformanceChart rows={t.monthly} />
        </article>
        <article className="panel weekly-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Current month control · EUR K</p>
              <h2>Invoice plan vs invoiced</h2>
              <p>
                {[
                  ...new Set(
                    data.rows.flatMap((r) =>
                      r.snapshot && r.metrics.monthEstimate !== null
                        ? [months[r.snapshot.month - 1]]
                        : [],
                    ),
                  ),
                ].join(" / ")}{" "}
                · source reporting month
              </p>
            </div>
          </div>
          <div className="apac-delivery">
            <strong>
              {formatK(t.monthSales)}
              <small>invoiced MTD</small>
            </strong>
            <span>of {formatK(t.monthEstimate)} estimated</span>
            <div className="delivery-track">
              <i
                style={{
                  width: `${t.monthEstimate ? Math.min(100, ((t.monthSales ?? 0) / t.monthEstimate) * 100) : 0}%`,
                }}
              />
            </div>
            <p>
              Still to invoice <b>{formatK(t.remaining)} kEUR</b>
            </p>
          </div>
          <div className="panel-foot">
            <span>
              Full-month estimate less MTD invoiced. Annual coverage and gap are
              calculated separately.
            </span>
            <span className="source-note">
              Partial when monthly invoicing inputs are unavailable.
            </span>
          </div>
        </article>
      </section>
      <section className="panel commercial-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Committed Dashboard exposure · EUR K</p>
            <h2>Dashboard by customer and brand</h2>
            <p>Largest committed exposures from order lines</p>
          </div>
          <label className="commercial-filter">
            <span>Customer</span>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="all">All available</option>
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
          <p className="muted">
            No customer detail supplied for this selection.
          </p>
        )}
        <div className="panel-foot">
          Committed orders only; Prospect excluded. Brand classification is not
          supplied and is not inferred.
        </div>
      </section>
      <section className="panel matrix-panel" id="analysis">
        <details open>
          <summary>
            <span>
              <p className="panel-kicker">Period analysis · EUR K</p>
              <h2>Time matrix</h2>
              <small>Monthly phasing and weekly annual scenario history</small>
            </span>
            <span className="disclosure-action">Explore time matrix →</span>
          </summary>
          <div className="matrix-body">
            <div className="analysis-toolbar matrix-toolbar">
              <Segmented
                label="Frequency"
                value={frequency}
                options={[
                  { value: "month", label: "Month" },
                  { value: "week", label: "Week" },
                ]}
                onChange={setFrequency}
              />
              <Segmented
                label="Rows"
                value={matrixLevel}
                options={[
                  { value: "entity", label: "Entities" },
                  { value: "bu", label: "Business Units" },
                ]}
                onChange={setMatrixLevel}
              />
              <p>
                {filters.year} · {filters.scenario}
              </p>
            </div>
            <div className="matrix-scroll">
              <table className="time-matrix">
                <thead>
                  <tr>
                    <th>BU / Entity</th>
                    {(frequency === "month"
                      ? months
                      : weeks.map((w) => `W${w}`)
                    ).map((m) => (
                      <th className="numeric" key={m}>
                        {m}
                      </th>
                    ))}
                    <th className="numeric">FY selected</th>
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
            <p className="muted">
              Blank cells mean unavailable source detail. Weekly snapshots are
              never added together.
            </p>
          </div>
        </details>
      </section>
      <section className="panel bu-panel" id="business-units">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">China · Entity detail</p>
            <h2>China total and entities</h2>
            <p>
              China remains visible across dashboard selections. Totals use
              permitted entities and known values.
            </p>
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
      <section className="quality-panel" id="data-quality">
        <details open>
          <summary>
            <div>
              <p className="panel-kicker">Executive controls</p>
              <h2>Management checks</h2>
            </div>
            <span>{data.checks.length} items to review</span>
          </summary>
          <p className="quality-intro">
            Coverage and annual gap stay unavailable until all selected entities
            have comparable budgets and scenario inputs.
          </p>
          <div className="quality-grid">
            {data.rows.map((r) => (
              <article className="apac-check" key={r.entity.id}>
                <strong>
                  {r.entity.code} · {r.snapshot ? "Review" : "Missing source"}
                </strong>
                <ul>
                  {(
                    r.snapshot?.findings ?? ["Source workbook not supplied"]
                  ).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </details>
      </section>
      <footer className="apac-footer">
        <span>DIAM · APAC Sales Performance</span>
        <span>
          {data.latestPublish
            ? `Last publish ${new Date(data.latestPublish).toLocaleString()}`
            : "Workbook baseline · no import published"}{" "}
          · kEUR
        </span>
      </footer>
    </>
  );
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [sessionChecked, setSessionChecked] = useState(false),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [data, setData] = useState<Dashboard | null>(null),
    [view, setView] = useState("overview"),
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
          setView("overview");
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
    setView("overview");
  };
  if (!sessionChecked)
    return <main className="login-shell">Loading account…</main>;
  if (!user)
    return (
      <main className="login-shell">
        <form className="panel login-panel" onSubmit={(e) => void login(e)}>
          <img src="/diam-logo.png" alt="DIAM" width="100" />
          <p className="panel-kicker">APAC sales performance</p>
          <h1>Sign in</h1>
          <p>Access your permitted regions and entities.</p>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="apac-button primary" disabled={loading}>
            Sign in
          </button>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </form>
      </main>
    );
  return (
    <DashboardShell
      user={user}
      filters={filters}
      onImport={() => setView("imports")}
      onAdmin={() => setView("admin")}
      onLogout={() => void logout()}
      onBrand={() => setView("brand")}
      onOverview={() => setView("overview")}
    >
      <main className="page-shell">
        {error && (
          <p className="apac-notice" role="alert">
            {error}
          </p>
        )}
        {loading && (
          <div className="loading-strip" role="status">
            Updating selected scope…
          </div>
        )}
        {view === "imports" ? (
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
            <p className="panel-kicker">Sales by brand · APAC</p>
            <h1>Brand source pending</h1>
            <p>
              No formal APAC brand source is present in the supplied workbooks.
              Customer order detail is available on the overview.
            </p>
            <button className="apac-button" onClick={() => setView("overview")}>
              Back to overview
            </button>
          </section>
        ) : data ? (
          <div
            aria-busy={loading}
            className={loading ? "dashboard-updating" : ""}
          >
            <DashboardView
              data={data}
              filters={filters}
              setFilters={setFilters}
            />
          </div>
        ) : (
          <p>Loading dashboard…</p>
        )}
      </main>
    </DashboardShell>
  );
}
