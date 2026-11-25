"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ClipboardList, FileText, Truck, Wallet, X } from "lucide-react";
import { opsWeek, opsWeekNumber } from "@/lib/sales-operations";
import {
  operationsStages,
  type OperationsStage,
  type OperationsWorkflowRecord,
} from "@/lib/sales-operations-workflow-types";
import {
  operationsStageTotals,
  type OperationsWorkflowView,
} from "@/lib/sales-operations-workflow";
import { useI18n } from "./i18n-provider";
import { opsCurrencyLabel } from "./sales-operations-register";
import styles from "./commercial.module.css";
import ops from "./sales-operations.module.css";

const stageIcons = {
  orders: ClipboardList,
  shipments: Truck,
  invoices: FileText,
  receipts: Wallet,
};
const pageSize = 20;
const scopeMissing = (
  stage: OperationsWorkflowView["stages"][OperationsStage],
) =>
  stage.expected.filter(
    (entity) => !stage.sources.some((source) => source.entity === entity),
  );

export function SalesOperationsWorkflow({
  data,
}: {
  data: OperationsWorkflowView;
}) {
  const { tr, locale } = useI18n();
  const [stage, setStage] = useState<OperationsStage>("orders");
  const thousands = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return (
    <>
      <section
        className={`${styles.metrics} ${ops.metricGrid}`}
        aria-label={tr("salesOps.workflow")}
      >
        {operationsStages.map((key) => {
          const source = data.stages[key];
          const totals = operationsStageTotals(source.records);
          const missing = scopeMissing(source);
          const Icon = stageIcons[key];
          return (
            <article
              className={`${styles.metric} ${ops.metricCard} ${stage === key ? ops.currentStage : ""}`}
              key={key}
            >
              <header className={ops.metricHeading}>
                <span aria-hidden="true">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <h2>
                  <button
                    className={ops.workflowTab}
                    type="button"
                    aria-pressed={stage === key}
                    onClick={() => setStage(key)}
                  >
                    {tr(`salesOps.workflow.${key}`)}
                  </button>
                </h2>
              </header>
              <div className={ops.stageFigures}>
                <strong>
                  {source.sources.length
                    ? new Intl.NumberFormat(locale).format(totals.documents)
                    : "—"}
                </strong>
                {totals.amounts.map(([code, amount]) => (
                  <div className={ops.metricSupporting} key={code}>
                    <div className={ops.metricFigure}>
                      <strong>{thousands.format(amount / 1000)}</strong>
                      <small>k{opsCurrencyLabel[code]}</small>
                    </div>
                  </div>
                ))}
              </div>
              <p className={ops.metricCaption}>
                {missing.length
                  ? tr("salesOps.workflowMissing", {
                      entities: missing.join(" / "),
                    })
                  : !source.expected.length
                    ? tr("salesOps.workflowShipmentsDdcOnly")
                    : totals.missing
                      ? tr(
                          key === "shipments"
                            ? "salesOps.workflowUnvaluedShipments"
                            : "salesOps.workflowMissingAmounts",
                          { count: totals.missing },
                        )
                      : tr(`salesOps.workflowBasis.${key}`)}
              </p>
            </article>
          );
        })}
      </section>
      <WorkflowRegister
        key={`${stage}/${data.entities.join("+")}/${data.from}/${data.asOf}`}
        data={data}
        stage={stage}
      />
    </>
  );
}

function WorkflowRegister({
  data,
  stage,
}: {
  data: OperationsWorkflowView;
  stage: OperationsStage;
}) {
  const { tr, locale } = useI18n();
  const [week, setWeek] = useState("");
  const [customer, setCustomer] = useState("");
  const [team, setTeam] = useState("");
  const [currency, setCurrency] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [details, setDetails] = useState<OperationsWorkflowRecord[]>();
  const source = data.stages[stage];
  const currencyName = (value: OperationsWorkflowRecord["currency"]) =>
    value ? opsCurrencyLabel[value] : "—";
  const nf = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const money = (value: number | null) =>
    value === null ? "—" : nf.format(value);
  const matches = source.records.filter(
    (row) =>
      (!week || opsWeek(row.date) === week) &&
      (!customer || row.customer === customer) &&
      (!team || (row.team ?? "__unassigned") === team) &&
      (!currency || (row.currency ?? "__no_amount") === currency) &&
      [
        row.document,
        row.customer,
        row.order ?? "",
        row.originalOrder ?? "",
        row.item ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const count = operationsStageTotals(matches);
  const groups = new Map<string, OperationsWorkflowRecord[]>();
  for (const row of matches) {
    const key = JSON.stringify(
      stage === "shipments"
        ? [row.entity, row.document, row.sourceRow]
        : [row.entity, row.document, row.currency],
    );
    const prior = groups.get(key);
    if (prior) prior.push(row);
    else groups.set(key, [row]);
  }
  const rows = [...groups].sort(
    ([, a], [, b]) =>
      b[0].date.localeCompare(a[0].date) ||
      a[0].document.localeCompare(b[0].document),
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const weeks = [...new Set(source.records.map((row) => opsWeek(row.date)))]
    .sort()
    .reverse();
  const customers = [
    ...new Set(source.records.map((row) => row.customer)),
  ].sort((a, b) => a.localeCompare(b, locale));
  const teams = [
    ...new Set(source.records.map((row) => row.team ?? "__unassigned")),
  ].sort();
  const currencies = [...new Set(source.records.map((row) => row.currency))];
  const missing = scopeMissing(source);
  const select = (
    label: string,
    value: string,
    update: (value: string) => void,
    options: [string, string][],
    all: string,
  ) => (
    <label className={ops.field}>
      {label}
      <select
        value={value}
        onChange={(event) => {
          update(event.target.value);
          setPage(0);
        }}
      >
        <option value="">{all}</option>
        {options.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section
      className={styles.panel}
      aria-label={tr(`salesOps.workflow.${stage}`)}
    >
      <div className={styles.sectionHeading}>
        <h2>{tr(`salesOps.workflow.${stage}`)}</h2>
        <span className={styles.status}>
          {data.from} – {data.asOf}
        </span>
      </div>
      <p className={styles.note}>{tr(`salesOps.workflowBasis.${stage}`)}</p>
      {missing.length > 0 && (
        <p className={ops.valuationNote}>
          {tr("salesOps.workflowMissing", { entities: missing.join(" / ") })}
        </p>
      )}
      {source.sources.length > 0 && (
        <>
          <div className={ops.registerControls}>
            {select(
              tr("salesOps.byWeek"),
              week,
              setWeek,
              weeks.map((start) => [
                start,
                `W${opsWeekNumber(start)} · ${start}`,
              ]),
              tr("salesOps.allWeeks"),
            )}
            {select(
              tr("common.customer"),
              customer,
              setCustomer,
              customers.map((name) => [name, name]),
              tr("salesOps.allCustomers"),
            )}
            {teams.some((name) => name !== "__unassigned") &&
              select(
                tr("team.label"),
                team,
                setTeam,
                teams.map((name) => [
                  name,
                  name === "__unassigned" ? tr("team.unassigned") : name,
                ]),
                tr("team.all"),
              )}
            {currencies.length > 1 &&
              select(
                tr("salesOps.currency"),
                currency,
                setCurrency,
                currencies.map((code) => [
                  code ?? "__no_amount",
                  code
                    ? opsCurrencyLabel[code]
                    : tr("salesOps.workflowNoAmount"),
                ]),
                tr("salesOps.allOriginalCurrencies"),
              )}
            <label className={ops.search}>
              <input
                type="search"
                aria-label={tr("salesOps.findDocument")}
                placeholder={tr("salesOps.findDocument")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
          <p className={styles.note}>
            {tr("salesOps.workflowFiltered", { count: count.documents })}{" "}
            {count.amounts
              .map(
                ([code, amount]) =>
                  `${money(amount)} ${opsCurrencyLabel[code]}`,
              )
              .join(" · ")}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {(
                    [
                      "salesOps.document",
                      "common.entity",
                      "salesOps.date",
                      "common.customer",
                      ...(stage === "shipments"
                        ? ([
                            "salesOps.order",
                            "salesOps.quantity",
                            "salesOps.originalOrder",
                          ] as const)
                        : []),
                      "salesOps.currency",
                      "salesOps.workflowAmount",
                    ] as const
                  ).map((key) => (
                    <th scope="col" key={key}>
                      {tr(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map(([key, entries]) => {
                    const row = entries[0];
                    const amounts = operationsStageTotals(entries).amounts;
                    return (
                      <tr key={key}>
                        <th scope="row">
                          {stage === "orders" || stage === "shipments" ? (
                            <button
                              type="button"
                              className={ops.orderButton}
                              onClick={() => setDetails(entries)}
                            >
                              {row.document}
                            </button>
                          ) : (
                            row.document
                          )}
                        </th>
                        <td>{row.entity}</td>
                        <td>{row.date}</td>
                        <td>{row.customer}</td>
                        {stage === "shipments" && (
                          <>
                            <td>{row.order}</td>
                            <td>{row.quantity}</td>
                            <td>{row.originalOrder ?? "—"}</td>
                          </>
                        )}
                        <td>{currencyName(row.currency)}</td>
                        <td>{money(amounts[0]?.[1] ?? null)}</td>
                      </tr>
                    );
                  })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={stage === "shipments" ? 9 : 6}
                      className={styles.empty}
                    >
                      {tr("salesOps.noDocuments")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={ops.pagination}>
            <span role="status">
              {tr("salesOps.documentPage", {
                count: rows.length,
                current: page + 1,
                total: totalPages,
              })}
            </span>
            {totalPages > 1 && (
              <>
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
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {tr("salesOps.next")}
                </button>
              </>
            )}
          </div>
          <details className={ops.sources}>
            <summary>{tr("salesOps.sources")}</summary>
            <ul>
              {source.sources.map((entry) => (
                <li key={`${entry.entity}/${entry.file}`}>
                  {entry.entity} · {entry.file} · {entry.sheet}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {details && (
        <WorkflowDetail
          rows={details}
          onClose={() => setDetails(undefined)}
          money={money}
          currencyName={currencyName}
        />
      )}
    </section>
  );
}

function WorkflowDetail({
  rows,
  onClose,
  money,
  currencyName,
}: {
  rows: OperationsWorkflowRecord[];
  onClose: () => void;
  money: (amount: number | null) => string;
  currencyName: (code: OperationsWorkflowRecord["currency"]) => string;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={ops.dialog}
      aria-labelledby={title}
      onClose={onClose}
    >
      <header className={ops.dialogHeader}>
        <div>
          <h2 id={title}>{rows[0].document}</h2>
          <p>
            {rows[0].entity} · {rows[0].date} · {rows[0].customer}
          </p>
        </div>
        <button
          type="button"
          className="apac-button"
          aria-label={tr("snapshot.close")}
          onClick={() => ref.current?.close()}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {(
                [
                  "salesOps.item",
                  "team.label",
                  "salesOps.quantity",
                  "salesOps.currency",
                  "salesOps.workflowAmount",
                  "salesOps.sourceRow",
                ] as const
              ).map((key) => (
                <th key={key} scope="col">
                  {tr(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sourceRow}>
                <th scope="row">{row.item || "—"}</th>
                <td>{row.team ?? tr("team.unassigned")}</td>
                <td>{row.quantity ?? "—"}</td>
                <td>{currencyName(row.currency)}</td>
                <td>{money(row.amount)}</td>
                <td>{row.sourceRow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
