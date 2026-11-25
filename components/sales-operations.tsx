"use client";

import { useEffect, useState } from "react";
import { CircleChevronRight, Search } from "lucide-react";
import type { SalesOperationsView } from "@/lib/sales-operations";
import type { OpsCurrency } from "@/lib/sales-operations-types";
import { useI18n } from "./i18n-provider";
import { SalesOperationsOrderDialog } from "./sales-operations-order-dialog";
import styles from "./commercial.module.css";
import ops from "./sales-operations.module.css";

const dimensions = ["byWeek", "byCustomer", "byTeam"] as const;
const labels = { CNY: "RMB", EUR: "EUR" };
const pageSize = 20;

function isoWeek(day: string) {
  const thursday = new Date(day + "T00:00:00Z");
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const january = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - january) / 604800000) + 1;
}

export function SalesOperations() {
  const { tr, locale } = useI18n();
  const [data, setData] = useState<SalesOperationsView | null>();
  const [error, setError] = useState<"access" | "load">();
  const [view, setView] = useState<(typeof dimensions)[number]>("byWeek");
  const [currency, setCurrency] = useState<OpsCurrency | "all">("all");
  const [order, setOrder] = useState<string>();
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/sales-operations", { signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 403) return setError("access");
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load");
      });
    return () => controller.abort();
  }, []);

  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const kFormat = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const money = (amount: number | null) =>
    amount === null ? "—" : format.format(amount);
  const thousands = (amount: number | null) =>
    amount === null ? "—" : kFormat.format(amount / 1000);
  const inCurrency = (row: { currency: OpsCurrency }) =>
    currency === "all" || row.currency === currency;
  const filtered = (data?.orders ?? []).filter(
    (row) =>
      inCurrency(row) &&
      (!openOnly || row.openLines > 0) &&
      (row.order + " " + row.customer)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currencyTotals = data?.currencies.filter(inCurrency) ?? [];
  const breakdown = view === "byCustomer" ? data?.customers : data?.teams;
  const orderCount = currencyTotals.reduce((n, row) => n + row.orders, 0);
  const label =
    view === "byWeek" ? tr("salesOps.weekStart") : tr(`salesOps.${view}`);

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>{tr("salesOps.title")}</h1>
          <p>
            {data
              ? `DDC · ${data.from} – ${data.asOf}`
              : tr("salesOps.homeDescription")}
          </p>
        </div>
        {data && (
          <label className={ops.field}>
            {tr("salesOps.currency")}
            <select
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value as typeof currency);
                setPage(0);
              }}
            >
              <option value="all">{tr("salesOps.allCurrencies")}</option>
              {data.currencies.map(({ currency: code }) => (
                <option key={code} value={code}>
                  {labels[code]}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {error ? (
        <p role="alert" className={styles.panel}>
          {tr(error === "access" ? "common.noAccess" : "salesOps.loadError")}
        </p>
      ) : !data ? (
        <p role="status" className={styles.panel}>
          {tr(data === undefined ? "auth.loading" : "salesOps.empty")}
        </p>
      ) : (
        <>
          <section
            className={styles.metrics}
            aria-label={tr("salesOps.orderSummary")}
          >
            <article className={styles.metric}>
              <span>{tr("salesOps.orderCount")}</span>
              <strong>{orderCount}</strong>
              {currencyTotals.map((total) => (
                <span key={total.currency}>
                  {thousands(total.ordered)} k{labels[total.currency]}
                </span>
              ))}
            </article>
            <article className={styles.metric}>
              <span>{tr("salesOps.shippedAmount")}</span>
              {currencyTotals.map((total) => (
                <strong className={ops.amount} key={total.currency}>
                  {thousands(total.shipped)}{" "}
                  <small>k{labels[total.currency]}</small>
                </strong>
              ))}
            </article>
            <article className={styles.metric}>
              <span>{tr("salesOps.openSnapshot")}</span>
              {currencyTotals.map((total) => (
                <strong className={ops.amount} key={total.currency}>
                  {thousands(total.open)}{" "}
                  <small>k{labels[total.currency]}</small>
                </strong>
              ))}
            </article>
            <article className={styles.metric}>
              <span>{tr("salesOps.matchedCash")}</span>
              {currencyTotals.map((total) => (
                <strong className={ops.amount} key={total.currency}>
                  {money(total.matchedCash)}{" "}
                  <small>{labels[total.currency]}</small>
                </strong>
              ))}
              <span>
                {tr("salesOps.receiptCoverage", {
                  receipts:
                    currency === "all"
                      ? data.receiptCount
                      : (currencyTotals[0]?.receiptCount ?? 0),
                  receivables:
                    currency === "all"
                      ? data.paymentReceivables
                      : (currencyTotals[0]?.paymentReceivables ?? 0),
                })}
              </span>
            </article>
          </section>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2>{tr("salesOps.orderAndShipment")}</h2>
              <div
                className={styles.segments}
                role="group"
                aria-label={tr("salesOps.viewBy")}
              >
                {dimensions.map((dimension) => (
                  <button
                    key={dimension}
                    type="button"
                    aria-pressed={view === dimension}
                    onClick={() => setView(dimension)}
                  >
                    {tr(`salesOps.${dimension}`)}
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.note}>
              {tr(
                view === "byWeek"
                  ? "salesOps.weekBasis"
                  : view === "byTeam"
                    ? "salesOps.teamBasis"
                    : "salesOps.customerBasis",
                {
                  asOf: data.asOf,
                  assigned: data.assignedLines,
                  unassigned:
                    data.orders.reduce((n, row) => n + row.lineCount, 0) -
                    data.assignedLines,
                },
              )}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{label}</th>
                    <th scope="col">{tr("salesOps.currency")}</th>
                    <th scope="col">{tr("salesOps.orderCount")}</th>
                    <th scope="col">{tr("salesOps.orderedAmount")}</th>
                    <th scope="col">{tr("salesOps.shippedAmount")}</th>
                    {view === "byWeek" && (
                      <th scope="col">{tr("salesOps.shipmentCount")}</th>
                    )}
                    <th scope="col">{tr("salesOps.openSnapshot")}</th>
                  </tr>
                </thead>
                <tbody>
                  {view === "byWeek"
                    ? data.weekly.filter(inCurrency).map((row) => (
                        <tr key={row.week + row.currency}>
                          <th scope="row">
                            W{isoWeek(row.week)} <small>· {row.week}</small>
                          </th>
                          <td>{labels[row.currency]}</td>
                          <td>{row.orders}</td>
                          <td>{money(row.ordered)}</td>
                          <td>{money(row.shipped)}</td>
                          <td>{row.shipmentDocuments}</td>
                          <td>{money(row.open)}</td>
                        </tr>
                      ))
                    : breakdown?.filter(inCurrency).map((row) => (
                        <tr key={JSON.stringify([row.name, row.currency])}>
                          <th scope="row">
                            {row.name || tr("team.unassigned")}
                          </th>
                          <td>{labels[row.currency]}</td>
                          <td>{row.orders}</td>
                          <td>{money(row.ordered)}</td>
                          <td>{money(row.shipped)}</td>
                          <td>{money(row.open)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>
              {tr("salesOps.missingAmounts", {
                count: data.missingOrderAmounts,
              })}
            </p>
          </section>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <h2>{tr("salesOps.orders")}</h2>
              <div className={ops.orderControls}>
                <label className={ops.search}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label={tr("salesOps.findOrder")}
                    placeholder={tr("salesOps.findOrder")}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label className={ops.checkbox}>
                  <input
                    type="checkbox"
                    checked={openOnly}
                    onChange={(event) => {
                      setOpenOnly(event.target.checked);
                      setPage(0);
                    }}
                  />
                  {tr("salesOps.openOnly")}
                </label>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {(
                      [
                        "order",
                        "orderDate",
                        "customer",
                        "currency",
                        "orderedAmount",
                        "shippedAmount",
                        "openSnapshot",
                      ] as const
                    ).map((name) => (
                      <th scope="col" key={name}>
                        {tr(
                          name === "customer"
                            ? "common.customer"
                            : `salesOps.${name}`,
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map((row) => (
                      <tr key={row.order}>
                        <th scope="row">
                          <button
                            type="button"
                            className={ops.orderButton}
                            onClick={() => setOrder(row.order)}
                          >
                            {row.order}
                            <CircleChevronRight size={15} aria-hidden="true" />
                          </button>
                        </th>
                        <td>{row.date}</td>
                        <td>{row.customer}</td>
                        <td>{labels[row.currency]}</td>
                        <td>{money(row.ordered)}</td>
                        <td>{money(row.shipped)}</td>
                        <td>{money(row.open)}</td>
                      </tr>
                    ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className={styles.empty}>
                        {tr("salesOps.noOrders")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={ops.pagination}>
              <span>
                {tr("salesOps.page", {
                  current: page + 1,
                  total: pageCount,
                  count: filtered.length,
                })}
              </span>
              <button
                type="button"
                className="apac-button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {tr("salesOps.previous")}
              </button>
              <button
                type="button"
                className="apac-button"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                {tr("salesOps.next")}
              </button>
            </div>
            <p className={styles.note}>{tr("salesOps.noDueDate")}</p>
          </section>
          <details className={ops.sources}>
            <summary>{tr("salesOps.sources")}</summary>
            <ul>
              {data.sources.map(({ file, sheet }) => (
                <li key={file}>
                  {file} · {sheet}
                </li>
              ))}
            </ul>
            <p>
              {tr("salesOps.sourceCoverage", {
                shipments: data.shipmentCount,
                receivables: data.receivableCount,
                invoices: data.invoiceCount,
              })}
            </p>
          </details>
          {order && (
            <SalesOperationsOrderDialog
              key={order}
              order={order}
              onClose={() => setOrder(undefined)}
            />
          )}
        </>
      )}
    </div>
  );
}
