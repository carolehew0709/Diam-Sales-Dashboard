"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type {
  OpsAmountBasis,
  OpsValueCurrency,
} from "@/lib/sales-operations-types";
import { useI18n } from "./i18n-provider";
import { SalesOperationsOrderDialog } from "./sales-operations-order-dialog";
import { SalesOperationsImport } from "./sales-operations-import";
import { SalesOperationsWorkflow } from "./sales-operations-workflow";
import {
  filterOperationsWorkflow,
  type OperationsWorkflowView,
} from "@/lib/sales-operations-workflow";
import type { OperationsEntity } from "@/lib/sales-operations-workflow-types";
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
  const [workflow, setWorkflow] = useState<OperationsWorkflowView | null>(null);
  const [entity, setEntity] = useState<OperationsEntity | "">("");
  const filteredWorkflow = useMemo(
    () => workflow && filterOperationsWorkflow(workflow, entity),
    [entity, workflow],
  );
  const [refresh, setRefresh] = useState(0);
  const [publishable, setPublishable] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<"access" | "load">();
  const [view, setView] = useState<(typeof dimensions)[number]>("byWeek");
  const [currency, setCurrency] = useState<OpsValueCurrency | "all">("all");
  const [basis, setBasis] = useState<OpsAmountBasis>("dehk");
  const [pricingAvailable, setPricingAvailable] = useState(false);
  const [stage, setStage] = useState<RegisterStage>("orders");
  const [selection, setSelection] = useState<OpsOrderSelection>();
  const [order, setOrder] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/sales-operations?basis=${basis}&view=workflow`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 403) return setError("access");
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) {
          setData(result.data);
          setWorkflow(result.workflow ?? null);
          setError(undefined);
          setPublishable(result.publishable === true);
          setPricingAvailable(result.originalPricingAvailable === true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load");
      });
    return () => controller.abort();
  }, [basis, refresh]);

  const precise = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (amount: number | null) =>
    amount === null ? "—" : precise.format(amount);
  const inCurrency = (row: { currency: OpsValueCurrency }) =>
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
  const activeBasis = data?.coverage ? "dehk" : "ddc";
  const switchingBasis = pricingAvailable && basis !== activeBasis && !error;
  const currencyName = (code: OpsValueCurrency) =>
    code === "PENDING" ? tr("salesOps.pricePending") : opsCurrencyLabel[code];
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
            {filteredWorkflow
              ? `${filteredWorkflow.entities.join(" + ")} · ${filteredWorkflow.from} – ${filteredWorkflow.asOf}`
              : data
                ? `DDC · ${data.from} – ${data.asOf}`
                : tr("salesOps.homeDescription")}
          </p>
        </div>
        <div className={ops.headerActions}>
          {workflow && workflow.entities.length > 1 && (
            <label className={ops.field}>
              {tr("common.entity")}
              <select
                value={entity}
                onChange={(event) =>
                  setEntity(event.target.value as OperationsEntity | "")
                }
              >
                <option value="">{tr("filters.allEntities")}</option>
                {workflow.entities.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          )}
          {pricingAvailable && (
            <label className={ops.field}>
              {tr("salesOps.amountBasis")}
              <select
                value={basis}
                aria-busy={switchingBasis}
                onChange={(event) => {
                  setCurrency("all");
                  setOrder(undefined);
                  clearSelection();
                  setBasis(event.target.value as OpsAmountBasis);
                }}
              >
                <option value="dehk">{tr("salesOps.dehkAmountBasis")}</option>
                <option value="ddc">{tr("salesOps.ddcAmountBasis")}</option>
              </select>
            </label>
          )}
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
                <option value="all">
                  {tr(
                    data.coverage
                      ? "salesOps.allOriginalCurrencies"
                      : "salesOps.allCurrencies",
                  )}
                </option>
                {data.currencies.map(({ currency: code }) => (
                  <option key={code} value={code}>
                    {currencyName(code)}
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
              {tr(
                workflow
                  ? "salesOps.workflowImportExecution"
                  : "salesOps.importTitle",
              )}
            </button>
          )}
        </div>
      </header>
      {importOpen && (
        <SalesOperationsImport
          onPublish={(snapshot) => {
            if (workflow) {
              setRefresh((latest) => latest + 1);
              return;
            }
            clearSelection();
            setCurrency("all");
            setStage("orders");
            setPricingAvailable(Boolean(snapshot.coverage));
            setBasis(snapshot.coverage ? "dehk" : "ddc");
            setData(snapshot);
          }}
        />
      )}
      {error ? (
        <p role="alert" className={styles.panel}>
          {tr(error === "access" ? "common.noAccess" : "salesOps.loadError")}
        </p>
      ) : filteredWorkflow ? (
        <SalesOperationsWorkflow data={filteredWorkflow} />
      ) : !data ? (
        <p role="status" className={styles.panel}>
          {tr(data === undefined ? "auth.loading" : "salesOps.empty")}
        </p>
      ) : (
        <>
          {data.coverage && (
            <p className={ops.valuationNote}>
              {tr("salesOps.originalPriceCoverage", {
                confirmed: data.coverage.confirmed,
                pending: data.coverage.pending,
              })}
            </p>
          )}
          <OpsSummary data={data} totals={currencyTotals} currency={currency} />
          {!data.coverage && hasGroupOrders && (
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
                  total: data.orderCount,
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
                              currency: currencyName(row.currency),
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
                        <td>{currencyName(row.currency)}</td>
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
                currency={
                  data.coverage && stage !== "shipments" ? "all" : currency
                }
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
              key={`${order}/${activeBasis}`}
              order={order}
              basis={activeBasis}
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
  currency: OpsValueCurrency | "all";
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
  const displayedAmounts = totals.filter(
    (total) => total.currency !== "PENDING",
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
      caption: tr(
        data.coverage
          ? "salesOps.originalShipmentBasis"
          : "salesOps.knownAmounts",
      ),
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
          currency === "all" || data.coverage
            ? data.receiptCount
            : (totals[0]?.receiptCount ?? 0),
        receivables:
          currency === "all" || data.coverage
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
              {number.format(
                currency === "all" ? data.orderCount : (totals[0]?.orders ?? 0),
              )}
            </strong>
          )}
          <div
            className={
              key === "orderCount" ? ops.metricSupporting : ops.metricFigures
            }
          >
            {(measure === "matchedCash" && data.coverage
              ? data.receiptTotals.map((row) => ({
                  currency: row.currency,
                  amount: row.matchedCash,
                }))
              : displayedAmounts.map((row) => ({
                  currency: row.currency,
                  amount: row[measure],
                }))
            ).map((row) => (
              <div className={ops.metricFigure} key={row.currency}>
                <strong>
                  {row.amount === null
                    ? "—"
                    : measure === "matchedCash"
                      ? cash.format(row.amount)
                      : kFormat.format(row.amount / 1000)}
                </strong>
                <small>
                  {measure === "matchedCash" ? "" : "k"}
                  {opsCurrencyLabel[row.currency]}
                </small>
              </div>
            ))}
            {measure !== "matchedCash" && !displayedAmounts.length && (
              <div className={ops.metricFigure}>
                <strong>—</strong>
              </div>
            )}
          </div>
          <p className={ops.metricCaption}>{caption}</p>
        </article>
      ))}
    </section>
  );
}
