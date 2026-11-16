"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { UpdateStatus } from "./update-status";
import { useDataReveal } from "./use-data-reveal";
import { ReceiptBalances } from "./receipt-balances";
import { Download, LoaderCircle } from "lucide-react";
import { ReceivablesSourceDates } from "./receivables-source-dates";
import { ReceivablesTrends } from "./receivables-trends";
import { useI18n } from "./i18n-provider";
import { agingBuckets, defaultReceivablesFilters } from "@/lib/receivables";
import type { ReceivablesView } from "@/lib/receivables";
import type { ReceivablesFilters } from "@/lib/receivables-types";
import { formatUpdateDate } from "@/lib/dashboard";
import styles from "./receivables-filters.module.css";

export function ReceivablesApp() {
  const { tr, locale } = useI18n();
  const [filters, setFilters] = useState<ReceivablesFilters>(
    defaultReceivablesFilters,
  );
  const [data, setData] = useState<ReceivablesView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [renderPending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  useDataReveal(
    root,
    data,
    ".ar-kpi-card, .ar-chart-grid > .panel:not([data-ar-trend])",
  );
  const query = useMemo(
    () =>
      new URLSearchParams(
        Object.entries(filters).filter(([, value]) => value !== undefined),
      ).toString(),
    [filters],
  );
  const pending = loading || renderPending || query !== appliedQuery;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`/api/receivables?${query}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) throw new Error(result.error);
        startTransition(() => {
          setData((previous) =>
            controller.signal.aborted ? previous : result.data,
          );
          setAppliedQuery((previous) =>
            controller.signal.aborted ? previous : query,
          );
          setError("");
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, retry]);
  const amount = (value: number | null) =>
    value === null
      ? "—"
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
          value,
        );
  const percentage = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const proportion = (value: number | null) =>
    value === null ? "—" : percentage.format(value);
  const team = (value: string) =>
    value === "__unassigned__" || !value ? tr("team.unassigned") : value;
  const select = <K extends keyof ReceivablesFilters>(
    key: K,
    value: ReceivablesFilters[K],
  ) =>
    setFilters({
      ...filters,
      [key]:
        key === "sourceCustomerGroup" && value === "all" ? undefined : value,
      ...([
        "region",
        "bu",
        "salesTeam",
        "sourceCustomerGroup",
        "salesType",
        "aging",
      ].includes(key)
        ? { customer: "all" }
        : {}),
      ...(["region", "bu"].includes(key)
        ? { sourceCustomerGroup: undefined }
        : {}),
    });
  const field = (
    key: keyof ReceivablesFilters,
    label: string,
    choices: { value: string; label: string }[],
  ) => (
    <div className="filter-field" key={key}>
      <label htmlFor={`ar-${key}`}>{label}</label>
      <select
        id={`ar-${key}`}
        value={filters[key] ?? "all"}
        disabled={!data}
        onChange={(e) => select(key, e.target.value as never)}
      >
        {choices.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
  const all = { value: "all", label: tr("ar.all") };
  return (
    <div ref={root} className="ar-workspace" aria-busy={pending && !error}>
      <section className="ar-heading panel-heading">
        <div>
          <p className="panel-kicker">{tr("ar.kicker")}</p>
          <h1>{tr("ar.title")}</h1>
          <p>{tr("ar.subtitle")}</p>
        </div>
        <ReceivablesSourceDates data={data} loading={loading} />
      </section>
      {error && (
        <div role="alert" className="apac-notice ar-load-error">
          <span>{tr("ar.loadError")}</span>
          <button
            className="apac-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            {tr("common.retry")}
          </button>
        </div>
      )}
      <section
        className={`filter-bar ar-filter-bar ${styles.sticky}`}
        data-updating={(pending && !error) || undefined}
        aria-label={tr("filters.global")}
      >
        {field("region", tr("filters.region"), [
          { value: "APAC", label: tr("filters.apac") },
          { value: "China", label: tr("ar.china") },
        ])}
        {field("bu", tr("common.buEntity"), [
          all,
          ...(data?.entities ?? []).map((e) => ({
            value: e.code,
            label: e.code,
          })),
        ])}
        {field("salesTeam", tr("team.label"), [
          all,
          ...(data?.salesTeams ?? []).map((t) => ({
            value: t,
            label: team(t),
          })),
        ])}
        {data?.sourceCustomerGroups.length || filters.sourceCustomerGroup
          ? field("sourceCustomerGroup", tr("ar.customerGroup"), [
              all,
              ...(data?.sourceCustomerGroups ?? []).map((value) => ({
                value,
                label: value,
              })),
            ])
          : null}
        {field("customer", tr("ar.customer"), [
          all,
          ...(data?.customers ?? []).map((c) => ({ value: c, label: c })),
        ])}
        {field("salesType", tr("filters.type"), [
          all,
          { value: "external", label: tr("ar.external") },
          { value: "group", label: tr("ar.group") },
        ])}
        {field("aging", tr("ar.agingFilter"), [
          all,
          ...agingBuckets.map((bucket) => ({
            value: bucket,
            label: tr(`ar.bucket.${bucket}`),
          })),
        ])}
        <UpdateStatus pending={pending && !error} />
      </section>
      <p className="ar-context">
        {tr("ar.currencyNote")} {tr("ar.receiptNote")}
      </p>
      {!data && !error && (
        <>
          <p className="ar-entry-status ui-feedback" role="status">
            <LoaderCircle className="ui-spinner" size={16} aria-hidden="true" />
            {tr("ar.loadingReport")}
          </p>
          <section className="ar-kpi-grid ar-loading" aria-hidden="true">
            {(["ar", "due", "overdue", "unknown"] as const).map((key) => (
              <article key={key} className="kpi-card ar-kpi-card">
                <div className="kpi-topline">{tr(`ar.metric.${key}`)}</div>
                <div className="ar-placeholder ar-placeholder-value" />
                <div className="ar-placeholder" />
                <p>{tr(`ar.note.${key}`)}</p>
              </article>
            ))}
          </section>
          <div className="ar-chart-grid ar-loading" aria-hidden="true">
            {[0, 1].map((index) => (
              <section className="panel" key={index}>
                <h2>{tr("ar.agingProfile")}</h2>
                <div className="ar-placeholder-chart">
                  {[90, 70, 45, 60, 35, 25, 20].map((width, row) => (
                    <div
                      key={row}
                      className="ar-placeholder"
                      style={{ width: `${width}%` }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {data && (
        <>
          <div className={styles.scopeActions}>
            <p className="ar-applied-scope">
              {tr("ar.showingScope", {
                scope: [
                  data.filters.region === "APAC"
                    ? tr("filters.apac")
                    : tr("ar.china"),
                  data.filters.bu === "all"
                    ? tr("filters.allBU")
                    : data.filters.bu,
                  data.filters.salesTeam === "all"
                    ? tr("team.all")
                    : team(data.filters.salesTeam),
                  data.filters.customer === "all"
                    ? tr("ar.allCustomers")
                    : data.filters.customer,
                  ...(data.filters.sourceCustomerGroup
                    ? [data.filters.sourceCustomerGroup]
                    : []),
                  data.filters.salesType === "all"
                    ? tr("filters.allSales")
                    : tr(
                        data.filters.salesType === "external"
                          ? "ar.external"
                          : "ar.group",
                      ),
                  data.filters.aging === "all"
                    ? tr("ar.allAging")
                    : tr(`ar.bucket.${data.filters.aging}`),
                ].join(" · "),
              })}
            </p>
            <a
              className="apac-button"
              href={`/api/receivables/export?${query}`}
              aria-disabled={pending || !!error || undefined}
              onClick={(event) => {
                if (pending || error) event.preventDefault();
              }}
            >
              <Download size={15} />
              {tr("nav.export")}
            </a>
          </div>
          {data.unclassifiedPayments > 0 && (
            <p className="ar-context">{tr("ar.receiptClassification")}</p>
          )}
          <section className="ar-kpi-grid">
            {(["ar", "due", "overdue", "unknown"] as const).map((key, i) => (
              <article
                className={`kpi-card ar-kpi-card ${i === 2 ? "kpi-accent" : ""}`}
                key={key}
              >
                <div className="kpi-topline">
                  <span>{tr(`ar.metric.${key}`)}</span>
                </div>
                <dl className="ar-kpi-values">
                  {data.totals.some((t) =>
                    key === "unknown" ? t.unknown !== null : t.ar !== null,
                  ) ? (
                    data.totals
                      .filter((t) =>
                        key === "unknown" ? t.unknown !== null : t.ar !== null,
                      )
                      .map((t) => (
                        <div key={t.currency}>
                          <dt>{t.currency}</dt>
                          <dd
                            className={
                              t[key] === null ? "ar-kpi-missing" : undefined
                            }
                          >
                            <strong>{amount(t[key])}</strong>
                          </dd>
                        </div>
                      ))
                  ) : (
                    <div>
                      <dt>{tr("ar.currency")}</dt>
                      <dd className="ar-kpi-missing">
                        <strong>—</strong>
                      </dd>
                    </div>
                  )}
                </dl>
                <p>{tr(`ar.note.${key}`)}</p>
              </article>
            ))}
          </section>
          {!data.sourceFiles.length && (
            <p className="apac-notice">{tr("ar.noSource")}</p>
          )}
          <div className="ar-chart-grid">
            {data.chart.map((chart) => (
              <section className="panel" key={chart.currency}>
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">{chart.currency}</p>
                    <h2>{tr("ar.agingProfile")}</h2>
                  </div>
                </div>
                <div className="ar-bars">
                  {chart.buckets.map((b) => (
                    <div className="ar-bar-row" key={b.bucket}>
                      <span>{tr(`ar.bucket.${b.bucket}`)}</span>
                      <div className="ar-bar-track">
                        <i
                          style={{
                            width: `${(Math.max(0, b.amount) / Math.max(1, ...chart.buckets.map((x) => Math.abs(x.amount)))) * 100}%`,
                          }}
                        />
                      </div>
                      <strong>{amount(b.amount)}</strong>
                    </div>
                  ))}
                </div>
                <div className={styles.proportions}>
                  <h3>{tr("ar.agingProportion")}</h3>
                  <div className="ar-bars">
                    {chart.buckets.map((b) => (
                      <div className="ar-bar-row" key={b.bucket}>
                        <span>{tr(`ar.bucket.${b.bucket}`)}</span>
                        <div className="ar-bar-track" aria-hidden="true">
                          <i
                            className={
                              (b.proportion ?? 0) < 0
                                ? styles.credit
                                : undefined
                            }
                            style={{
                              width: `${Math.min(1, Math.abs(b.proportion ?? 0)) * 100}%`,
                            }}
                          />
                        </div>
                        <strong>{proportion(b.proportion)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.overdueShare}>
                    <span>{tr("ar.overdueProportion")}</span>
                    <strong>{proportion(chart.overdueProportion)}</strong>
                  </div>
                  <p className="muted">{tr("ar.proportionNote")}</p>
                </div>
              </section>
            ))}
          </div>
          <div className="ar-chart-grid">
            {data.chart.map(({ currency }) => {
              const ranking = data.ranking.filter(
                (row) => row.currency === currency,
              );
              return (
                <section
                  className="panel ar-detail"
                  key={currency}
                  data-ranking-currency={currency}
                >
                  <div className={`panel-heading ${styles.rankingHeading}`}>
                    <div>
                      <p className="panel-kicker">{currency}</p>
                      <h2>{tr("ar.ranking")}</h2>
                    </div>
                    <span className="muted">{tr("ar.rankingNote")}</span>
                  </div>
                  <div className="table-wrap">
                    <table className={`bu-table ${styles.rankingTable}`}>
                      <thead>
                        <tr>
                          <th>{tr("ar.customerGroup")}</th>
                          <th className="numeric">{tr("ar.metric.ar")}</th>
                          <th className="numeric">{tr("ar.metric.overdue")}</th>
                          <th className="numeric">{tr("ar.overduePercent")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!ranking.length && (
                          <tr>
                            <td colSpan={4} className="ar-empty">
                              {tr(
                                data.rankingExcludedCurrencies.includes(
                                  currency,
                                )
                                  ? "ar.noRankableCustomers"
                                  : "ar.noMatches",
                              )}
                            </td>
                          </tr>
                        )}
                        {ranking.map((row) => {
                          const { customerGroup } = row;
                          return (
                            <tr
                              key={
                                customerGroup === null
                                  ? "others"
                                  : `group:${customerGroup}`
                              }
                            >
                              <td>
                                {customerGroup === null ? (
                                  <strong>{tr("ar.others")}</strong>
                                ) : (
                                  <button
                                    className="entity-link"
                                    onClick={() =>
                                      select(
                                        "sourceCustomerGroup",
                                        customerGroup,
                                      )
                                    }
                                  >
                                    {customerGroup}
                                  </button>
                                )}
                              </td>
                              <td className="numeric">{amount(row.amount)}</td>
                              <td className="numeric">{amount(row.overdue)}</td>
                              <td className="numeric">
                                <div className={styles.rankingShare}>
                                  <div
                                    className="ar-bar-track"
                                    aria-hidden="true"
                                  >
                                    <i
                                      className={
                                        (row.overdueProportion ?? 0) < 0
                                          ? styles.credit
                                          : undefined
                                      }
                                      style={{
                                        width: `${Math.min(1, Math.abs(row.overdueProportion ?? 0)) * 100}%`,
                                      }}
                                    />
                                  </div>
                                  <strong>
                                    {proportion(row.overdueProportion)}
                                  </strong>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {ranking.length > 0 && (
                    <p className="muted">{tr("ar.rankingOverdueNote")}</p>
                  )}
                </section>
              );
            })}
          </div>
          <ReceivablesTrends />
          <section className="panel ar-detail">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">{tr("ar.sharedReceipts")}</p>
                <h2>{tr("ar.payments")}</h2>
              </div>
              <span>
                {tr("ar.receiptCount", { count: data.payments.length })}
              </span>
            </div>
            {!data.paymentsAllowed && <p>{tr("ar.sharedAccess")}</p>}
            {data.latestReceiptDate && (
              <p className="ar-context">
                {tr("ar.latestReceiptDate")}:{" "}
                <time dateTime={data.latestReceiptDate}>
                  {data.latestReceiptDate}
                </time>
              </p>
            )}
            <ReceiptBalances
              rows={data.receiptSummary}
              caption={tr("ar.receiptSummary")}
            />
            <div className="table-wrap">
              <table className="bu-table ar-table">
                <thead>
                  <tr>
                    {(
                      [
                        "category",
                        "received",
                        "customer",
                        "team",
                        "pic",
                        "balance",
                        "note",
                      ] as const
                    ).map((key) => (
                      <th key={key}>{tr(`ar.column.${key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!data.payments.length && (
                    <tr>
                      <td colSpan={7} className="ar-empty">
                        {tr(
                          data.paymentsAllowed
                            ? "ar.noMatches"
                            : "ar.sharedAccess",
                        )}
                      </td>
                    </tr>
                  )}
                  {data.payments.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {tr(
                          `ar.category.${row.category === "invoice" ? "unknown" : row.category}`,
                        )}
                      </td>
                      <td>{row.receivedDate}</td>
                      <td>
                        {row.customer}
                        <small>{row.payer}</small>
                      </td>
                      <td>{team(row.salesTeam)}</td>
                      <td>{row.pic || "—"}</td>
                      <td className="numeric">
                        {amount(row.amount)} {row.currency}
                      </td>
                      <td className="ar-note-cell">{row.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <footer className="dashboard-footer">
            <span>
              {tr("ar.sources")}: {data.sourceFiles.join(" · ")}
            </span>
            <span>
              {tr("footer.latestUpdate", {
                date: formatUpdateDate(data.latestDataUpdate, locale),
              })}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
