"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, WalletCards } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { agingBuckets, defaultReceivablesFilters } from "@/lib/receivables";
import type { ReceivablesView } from "@/lib/receivables";
import type { ReceivablesFilters } from "@/lib/receivables-types";
import { formatUpdateDate } from "@/lib/dashboard";

export function ReceivablesApp() {
  const { tr, locale } = useI18n();
  const [filters, setFilters] = useState<ReceivablesFilters>(
    defaultReceivablesFilters,
  );
  const [data, setData] = useState<ReceivablesView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoicePage, setInvoicePage] = useState(0);
  const query = useMemo(
    () => new URLSearchParams(Object.entries(filters)).toString(),
    [filters],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/receivables?${query}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.error);
        setData(result.data);
        setError("");
        setInvoicePage(0);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);
  const amount = (value: number | null) =>
    value === null
      ? "—"
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
          value,
        );
  const team = (value: string) =>
    value === "__unassigned__" || !value ? tr("team.unassigned") : value;
  const select = <K extends keyof ReceivablesFilters>(
    key: K,
    value: ReceivablesFilters[K],
  ) =>
    setFilters({
      ...filters,
      [key]: value,
      ...([
        "region",
        "bu",
        "salesTeam",
        "customerGroup",
        "salesType",
        "aging",
      ].includes(key)
        ? { customer: "all" }
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
        value={filters[key]}
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
    <div
      className={`ar-workspace ${loading ? "dashboard-updating" : ""}`}
      aria-busy={loading}
    >
      <section className="ar-heading panel-heading">
        <div>
          <p className="panel-kicker">{tr("ar.kicker")}</p>
          <h1>{tr("ar.title")}</h1>
          <p>{tr("ar.subtitle")}</p>
        </div>
        <div className="ar-asof">
          <WalletCards size={22} />
          <span>
            {tr("ar.asOf")}
            <strong>{data?.asOfDates.join(" / ") || "—"}</strong>
          </span>
        </div>
      </section>
      {error && (
        <p role="alert" className="apac-notice">
          {tr("ar.loadError")}
        </p>
      )}
      {data && (
        <>
          <section
            className="filter-bar ar-filter-bar"
            aria-label={tr("filters.global")}
          >
            {field("region", tr("filters.region"), [
              { value: "APAC", label: tr("filters.apac") },
              { value: "China", label: tr("ar.china") },
            ])}
            {field("bu", tr("common.buEntity"), [
              all,
              ...data.entities.map((e) => ({ value: e.code, label: e.code })),
            ])}
            {field("salesTeam", tr("team.label"), [
              all,
              ...data.salesTeams.map((t) => ({ value: t, label: team(t) })),
            ])}
            {field("customerGroup", tr("ar.customerGroup"), [
              all,
              { value: "top10", label: tr("ar.top10") },
              { value: "other", label: tr("ar.other") },
            ])}
            {field("customer", tr("ar.customer"), [
              {
                ...all,
                label:
                  filters.customerGroup === "other"
                    ? tr("ar.allOther")
                    : all.label,
              },
              ...data.customers.map((c) => ({ value: c, label: c })),
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
          </section>
          <p className="ar-context">
            {tr("ar.currencyNote")} {tr("ar.receiptNote")}
          </p>
          {data.unclassifiedPayments > 0 && (
            <p className="ar-context">{tr("ar.receiptClassification")}</p>
          )}
          <section className="ar-kpi-grid">
            {(["ar", "due", "overdue", "unknown"] as const).map((key, i) => (
              <article
                className={`kpi-card ${i === 2 ? "kpi-accent" : ""}`}
                key={key}
              >
                <div className="kpi-topline">
                  <span>{tr(`ar.metric.${key}`)}</span>
                  <small>{tr("ar.currency")}</small>
                </div>
                <div className="ar-kpi-values">
                  {data.totals.length ? (
                    data.totals.map((t) => (
                      <div key={t.currency}>
                        <strong>{amount(t[key])}</strong>
                        <span>{t.currency}</span>
                      </div>
                    ))
                  ) : (
                    <strong>—</strong>
                  )}
                </div>
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
              </section>
            ))}
          </div>
          <section className="panel ar-detail">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">{tr("ar.byCustomer")}</p>
                <h2>{tr("ar.ranking")}</h2>
              </div>
              <span className="muted">{tr("ar.rankingNote")}</span>
            </div>
            <div className="table-wrap">
              <table className="bu-table">
                <thead>
                  <tr>
                    <th>{tr("ar.customer")}</th>
                    <th>{tr("ar.currency")}</th>
                    <th className="numeric">{tr("ar.metric.ar")}</th>
                    <th className="numeric">{tr("ar.metric.overdue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...data.ranking
                      .filter((r) => r.currency === "EUR")
                      .slice(0, 10),
                    ...data.ranking
                      .filter((r) => r.currency === "RMB")
                      .slice(0, 10),
                  ].map((row) => (
                    <tr key={`${row.currency}:${row.customer}`}>
                      <td>
                        <button
                          className="entity-link"
                          onClick={() => select("customer", row.customer)}
                        >
                          {row.customer}
                        </button>
                      </td>
                      <td>{row.currency}</td>
                      <td className="numeric">{amount(row.amount)}</td>
                      <td className="numeric">{amount(row.overdue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel ar-detail">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">{tr("ar.invoiceDetail")}</p>
                <h2>{tr("ar.invoices", { count: data.rows.length })}</h2>
              </div>
              <a
                className="apac-button"
                href={`/api/receivables/export?${query}`}
              >
                <Download size={15} />
                {tr("nav.export")}
              </a>
            </div>
            <div className="table-wrap">
              <table className="bu-table ar-table">
                <thead>
                  <tr>
                    {(
                      [
                        "bu",
                        "date",
                        "invoice",
                        "customer",
                        "team",
                        "pic",
                        "amount",
                        "aging",
                        "note",
                      ] as const
                    ).map((key) => (
                      <th key={key}>{tr(`ar.column.${key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows
                    .slice(invoicePage * 50, invoicePage * 50 + 50)
                    .map((row) => (
                      <tr key={row.id}>
                        <td>{row.entityId === "dhk" ? "DEHK" : "DDC"}</td>
                        <td>{row.invoiceDate}</td>
                        <td>{row.invoiceNumber}</td>
                        <td>
                          {row.customer}
                          <small>{row.subCustomer}</small>
                        </td>
                        <td>{team(row.salesTeam)}</td>
                        <td>{row.pic || "—"}</td>
                        <td className="numeric">
                          {amount(row.amount)} {row.currency}
                        </td>
                        <td>{tr(`ar.bucket.${row.aging}`)}</td>
                        <td className="ar-note-cell">{row.note || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="ar-pagination">
              <button
                className="apac-button"
                disabled={!invoicePage}
                onClick={() => setInvoicePage((p) => p - 1)}
              >
                {tr("ar.previous")}
              </button>
              <span>
                {invoicePage + 1} /{" "}
                {Math.max(1, Math.ceil(data.rows.length / 50))}
              </span>
              <button
                className="apac-button"
                disabled={(invoicePage + 1) * 50 >= data.rows.length}
                onClick={() => setInvoicePage((p) => p + 1)}
              >
                {tr("ar.next")}
              </button>
            </div>
          </section>
          <section className="panel ar-detail">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">{tr("ar.sharedReceipts")}</p>
                <h2>{tr("ar.payments")}</h2>
              </div>
              <span>
                {tr("ar.advanceTotal")}:{" "}
                {data.totals
                  .filter((t) => t.currency === "EUR")
                  .map((t) => amount(t.advance))
                  .join(" ") || "—"}{" "}
                EUR
              </span>
            </div>
            {!data.paymentsAllowed && <p>{tr("ar.sharedAccess")}</p>}
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
                  {data.payments.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {tr(
                          row.category === "unknown"
                            ? "ar.category.unknown"
                            : "ar.category.advance",
                        )}
                      </td>
                      <td>{row.receivedDate}</td>
                      <td>
                        {row.customer}
                        <small>{row.payer}</small>
                      </td>
                      <td>{team(row.salesTeam)}</td>
                      <td>{row.pic || "—"}</td>
                      <td className="numeric">{amount(row.amount)} EUR</td>
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
