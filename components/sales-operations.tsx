"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ClipboardList,
  PackageOpen,
  Truck,
  Wallet,
} from "lucide-react";
import {
  opsWeekNumber,
  type OpsOrderSelection,
  type SalesOperationsView,
} from "@/lib/sales-operations";
import type { OpsCurrency } from "@/lib/sales-operations-types";
import { useI18n } from "./i18n-provider";
import { SalesOperationsOrderDialog } from "./sales-operations-order-dialog";
import { SalesOperationsImport } from "./sales-operations-import";
import {
  DocumentRegister,
  OrderRegister,
  opsCurrencyLabel,
  registerStages,
  type RegisterStage,
} from "./sales-operations-register";
import styles from "./commercial.module.css";
import ops from "./sales-operations.module.css";

const dimensions = ["byWeek", "byCustomer", "byTeam"] as const;

export function SalesOperations() {
  const { tr, locale } = useI18n();
  const register = useRef<HTMLElement>(null);
  const [data, setData] = useState<SalesOperationsView | null>();
  const [publishable, setPublishable] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<"access" | "load">();
  const [view, setView] = useState<(typeof dimensions)[number]>("byWeek");
  const [currency, setCurrency] = useState<OpsCurrency | "all">("all");
  const [stage, setStage] = useState<RegisterStage>("orders");
  const [selection, setSelection] = useState<OpsOrderSelection>();
  const [order, setOrder] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/sales-operations", { signal: controller.signal })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 403) return setError("access");
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
          setData(result.data);
          setPublishable(result.publishable === true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load");
      });
    return () => controller.abort();
  }, []);

  const precise = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (amount: number | null) =>
    amount === null ? "—" : precise.format(amount);
  const inCurrency = (row: { currency: OpsCurrency }) =>
    currency === "all" || row.currency === currency;
  const currencyTotals = data?.currencies.filter(inCurrency) ?? [];
  const rows = data
    ? view === "byWeek"
      ? data.weekly
      : view === "byCustomer"
        ? data.customers
        : data.teams
    : [];
  const hasGroupOrders = currencyTotals.some(
    ({ groupOrders }) => groupOrders > 0,
  );
  const clearSelection = () => setSelection(undefined);
  function seeOrders(scope: OpsOrderSelection) {
    setSelection(scope);
    setStage("orders");
    register.current?.focus({ preventScroll: true });
    register.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div className={styles.workspace}>
      <header className={`${styles.header} ${ops.pageHeader}`}>
        <div>
          <h1>{tr("salesOps.title")}</h1>
          <p>
            {data
              ? `DDC · ${data.from} – ${data.asOf}`
              : tr("salesOps.homeDescription")}
          </p>
        </div>
        <div className={ops.headerActions}>
          {data && (
            <label className={ops.field}>
              {tr("salesOps.currency")}
              <select
                value={currency}
                onChange={(event) => {
                  setCurrency(event.target.value as typeof currency);
                  clearSelection();
                }}
              >
                <option value="all">{tr("salesOps.allCurrencies")}</option>
                {data.currencies.map(({ currency: code }) => (
                  <option key={code} value={code}>
                    {opsCurrencyLabel[code]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {publishable && (
            <button
              className="apac-button"
              type="button"
              aria-expanded={importOpen}
              onClick={() => setImportOpen(!importOpen)}
            >
              {tr("salesOps.importTitle")}
            </button>
          )}
        </div>
      </header>
      {importOpen && (
        <SalesOperationsImport
          onPublish={(snapshot) => {
            clearSelection();
            setCurrency("all");
            setStage("orders");
            setData(snapshot);
          }}
        />
      )}
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
          <OpsSummary data={data} totals={currencyTotals} currency={currency} />
          {hasGroupOrders && (
            <p className={ops.groupSource}>{tr("salesOps.groupSource")}</p>
          )}
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
                    onClick={() => {
                      setView(dimension);
                      clearSelection();
                    }}
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
                    data.orders.reduce(
                      (total, row) => total + row.lineCount,
                      0,
                    ) - data.assignedLines,
                  split: data.splitTeamOrders,
                  total: data.orders.length,
                },
              )}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">
                      {tr(
                        view === "byWeek"
                          ? "salesOps.weekStart"
                          : `salesOps.${view}`,
                      )}
                    </th>
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
                  {rows.filter(inCurrency).map((row) => {
                    const scope: OpsOrderSelection =
                      "week" in row
                        ? {
                            currency: row.currency,
                            dimension: "byWeek",
                            week: row.week,
                          }
                        : {
                            currency: row.currency,
                            dimension:
                              view === "byTeam" ? "byTeam" : "byCustomer",
                            name: row.name,
                          };
                    const name =
                      "week" in row
                        ? `W${opsWeekNumber(row.week)}`
                        : row.name || tr("team.unassigned");
                    const active =
                      JSON.stringify(scope) === JSON.stringify(selection);
                    return (
                      <tr
                        key={JSON.stringify(scope)}
                        className={active ? ops.activeRow : undefined}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className={ops.orderButton}
                            aria-pressed={active}
                            onClick={() => seeOrders(scope)}
                            aria-label={tr("salesOps.viewOrdersFor", {
                              name,
                              currency: opsCurrencyLabel[row.currency],
                            })}
                          >
                            {name}
                            <ArrowDownRight size={14} aria-hidden="true" />
                          </button>
                          {"week" in row && (
                            <small>
                              {row.weekFrom} – {row.weekTo}
                              {row.partial && (
                                <span className={ops.partial}>
                                  {tr("salesOps.partialWeek")}
                                </span>
                              )}
                            </small>
                          )}
                        </th>
                        <td>{opsCurrencyLabel[row.currency]}</td>
                        <td>{row.orders}</td>
                        <td>{money(row.ordered)}</td>
                        <td>{money(row.shipped)}</td>
                        {"week" in row && <td>{row.shipmentDocuments}</td>}
                        <td>{money(row.open)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section
            ref={register}
            tabIndex={-1}
            className={`${styles.panel} ${ops.register}`}
            aria-label={tr("salesOps.workflow")}
          >
            <div className={styles.sectionHeading}>
              <h2>{tr("salesOps.workflow")}</h2>
              <div
                className={styles.segments}
                role="group"
                aria-label={tr("salesOps.registerView")}
              >
                {registerStages.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={stage === value}
                    onClick={() => setStage(value)}
                  >
                    {tr(`salesOps.${value}`)}
                  </button>
                ))}
              </div>
            </div>
            {stage === "orders" ? (
              <OrderRegister
                key={JSON.stringify([currency, selection, data.version])}
                data={data}
                currency={currency}
                selection={selection}
                onClearSelection={clearSelection}
                onOrder={setOrder}
              />
            ) : (
              <DocumentRegister
                key={`${stage}/${currency}/${data.version}`}
                stage={stage}
                data={data}
                currency={currency}
                onOrder={setOrder}
              />
            )}
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

function OpsSummary({
  data,
  totals,
  currency,
}: {
  data: SalesOperationsView;
  totals: SalesOperationsView["currencies"];
  currency: OpsCurrency | "all";
}) {
  const { tr, locale } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const kFormat = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const cash = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const missing = totals.reduce(
    (total, row) => total + row.missingOrderAmounts,
    0,
  );
  const cards = [
    {
      key: "orderCount",
      measure: "ordered",
      Icon: ClipboardList,
      caption: missing
        ? tr("salesOps.missingAmounts", { count: missing })
        : tr("salesOps.orderedAmount"),
    },
    {
      key: "shippedAmount",
      measure: "shipped",
      Icon: Truck,
      caption: tr("salesOps.knownAmounts"),
    },
    {
      key: "openSnapshot",
      measure: "open",
      Icon: PackageOpen,
      caption: tr("salesOps.knownSnapshot", { asOf: data.asOf }),
    },
    {
      key: "matchedCash",
      measure: "matchedCash",
      Icon: Wallet,
      caption: tr("salesOps.receiptCoverage", {
        receipts:
          currency === "all"
            ? data.receiptCount
            : (totals[0]?.receiptCount ?? 0),
        receivables:
          currency === "all"
            ? data.paymentReceivables
            : (totals[0]?.paymentReceivables ?? 0),
      }),
    },
  ] as const;
  return (
    <section
      className={`${styles.metrics} ${ops.metricGrid}`}
      aria-label={tr("salesOps.orderSummary")}
    >
      {cards.map(({ key, measure, Icon, caption }) => (
        <article key={key} className={`${styles.metric} ${ops.metricCard}`}>
          <header className={ops.metricHeading}>
            <span aria-hidden="true">
              <Icon size={17} strokeWidth={1.8} />
            </span>
            <h2>{tr(`salesOps.${key}`)}</h2>
          </header>
          {key === "orderCount" && (
            <strong className={ops.orderCount}>
              {number.format(totals.reduce((sum, row) => sum + row.orders, 0))}
            </strong>
          )}
          <div
            className={
              key === "orderCount" ? ops.metricSupporting : ops.metricFigures
            }
          >
            {totals.map((row) => (
              <div className={ops.metricFigure} key={row.currency}>
                <strong>
                  {row[measure] === null
                    ? "—"
                    : measure === "matchedCash"
                      ? cash.format(row[measure])
                      : kFormat.format(row[measure] / 1000)}
                </strong>
                <small>
                  {measure === "matchedCash" ? "" : "k"}
                  {opsCurrencyLabel[row.currency]}
                </small>
              </div>
            ))}
          </div>
          <p className={ops.metricCaption}>{caption}</p>
        </article>
      ))}
    </section>
  );
}
