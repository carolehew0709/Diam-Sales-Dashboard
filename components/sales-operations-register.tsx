"use client";

import { useState, type ReactNode } from "react";
import { CircleChevronRight, Search, X } from "lucide-react";
import type { OpsCurrency } from "@/lib/sales-operations-types";
import {
  opsSelectedOrders,
  opsWeek,
  opsWeekNumber,
  type OpsOrderSelection,
  type SalesOperationsView,
} from "@/lib/sales-operations";
import { useI18n } from "./i18n-provider";
import styles from "./commercial.module.css";
import ops from "./sales-operations.module.css";

export const registerStages = [
  "orders",
  "shipments",
  "receivables",
  "invoiceReferences",
  "payments",
] as const;
export type RegisterStage = (typeof registerStages)[number];
export const opsCurrencyLabel = { CNY: "RMB", EUR: "EUR" };
const pageSize = 20;

export function orderSelectionLabel(
  selection: OpsOrderSelection,
  unassigned: string,
) {
  const name =
    selection.dimension === "byWeek"
      ? `W${opsWeekNumber(selection.week)}`
      : selection.name || unassigned;
  return `${name} · ${opsCurrencyLabel[selection.currency]}`;
}

type RegisterProps = {
  data: SalesOperationsView;
  currency: OpsCurrency | "all";
  onOrder: (order: string) => void;
};

export function OrderRegister({
  data,
  currency,
  selection,
  onClearSelection,
  onOrder,
}: RegisterProps & {
  selection?: OpsOrderSelection;
  onClearSelection: () => void;
}) {
  const { tr, locale } = useI18n();
  const money = useMoney(locale);
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [page, setPage] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const orders = opsSelectedOrders(data.orders, selection).filter(
    (row) =>
      (currency === "all" || row.currency === currency) &&
      (!openOnly || row.openLines > 0) &&
      `${row.order} ${row.customer}`.toLowerCase().includes(normalizedQuery),
  );
  return (
    <>
      <div className={ops.registerControls}>
        {selection && (
          <button
            className={ops.scopePill}
            type="button"
            onClick={onClearSelection}
            aria-label={tr("salesOps.clearSelection")}
          >
            {orderSelectionLabel(selection, tr("team.unassigned"))}
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <SearchInput
          label={tr("salesOps.findOrder")}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
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
      <p className={styles.note}>
        {tr(
          selection?.dimension === "byWeek"
            ? "salesOps.selectedWeekNote"
            : "salesOps.orderRegisterNote",
        )}
      </p>
      <RegisterTable
        headers={[
          tr("salesOps.order"),
          tr("salesOps.orderDate"),
          tr("common.customer"),
          tr("team.label"),
          tr("salesOps.currency"),
          tr("salesOps.orderedAmount"),
          tr("salesOps.shippedAmount"),
          tr("salesOps.openSnapshot"),
          tr("salesOps.openLines"),
          tr("salesOps.receivables"),
          tr("salesOps.invoiceReferences"),
          tr("salesOps.payments"),
        ]}
        rows={orders
          .slice(page * pageSize, (page + 1) * pageSize)
          .map((row) => ({
            key: row.order,
            cells: [
              <OrderLink key={row.order} order={row.order} onOrder={onOrder} />,
              row.date,
              row.customer,
              row.teams
                .map(({ name }) => name ?? tr("team.unassigned"))
                .join(" · "),
              opsCurrencyLabel[row.currency],
              money(row.ordered),
              money(row.shipped),
              money(row.open),
              row.openLines,
              row.receivableCount || "—",
              row.invoiceCount || "—",
              row.receiptCount || "—",
            ],
          }))}
        empty={tr("salesOps.noOrders")}
      />
      <RegisterPages
        count={orders.length}
        page={page}
        onPage={setPage}
        orders
      />
      {openOnly && <p className={styles.note}>{tr("salesOps.noDueDate")}</p>}
    </>
  );
}

type DocumentStage = Exclude<RegisterStage, "orders">;
type DocumentRow =
  | SalesOperationsView["shipmentRegister"][number]
  | SalesOperationsView["receivableRegister"][number]
  | SalesOperationsView["paymentRegister"][number];

const dateColumn: Record<
  DocumentStage,
  "date" | "receivableDate" | "receiptDate"
> = {
  shipments: "date",
  receivables: "receivableDate",
  invoiceReferences: "receivableDate",
  payments: "receiptDate",
};

export function DocumentRegister({
  stage,
  data,
  currency,
  onOrder,
}: RegisterProps & { stage: DocumentStage }) {
  const { tr, locale } = useI18n();
  const money = useMoney(locale);
  const [week, setWeek] = useState("");
  const [customer, setCustomer] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const invoiceView = stage === "invoiceReferences";
  const dateLabel = tr(`salesOps.${dateColumn[stage]}`);
  const rows: DocumentRow[] = (
    stage === "shipments"
      ? data.shipmentRegister
      : stage === "payments"
        ? data.paymentRegister
        : invoiceView
          ? data.receivableRegister.filter((row) => row.invoices.length)
          : data.receivableRegister
  ).filter((row) => currency === "all" || row.currency === currency);
  const weeks = [...new Set(rows.map(({ date }) => opsWeek(date)))]
    .sort()
    .reverse();
  const customers = [...new Set(rows.flatMap((row) => row.customers))].sort(
    (a, b) => a.localeCompare(b, locale),
  );
  const search = query.trim().toLowerCase();
  const matches = rows
    .filter((row) => {
      if (week && opsWeek(row.date) !== week) return false;
      if (customer && !row.customers.includes(customer)) return false;
      const identifiers =
        "receipt" in row
          ? [row.receipt, row.receivable]
          : "invoices" in row
            ? [row.document, ...row.invoices]
            : [row.document];
      return (
        invoiceView ||
        !search ||
        [...identifiers, ...row.orders, ...row.customers].some((text) =>
          text.toLowerCase().includes(search),
        )
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const invoiceGroups = new Map<
    string,
    SalesOperationsView["receivableRegister"]
  >();
  if (invoiceView)
    for (const row of matches) {
      if (!("invoices" in row)) continue;
      for (const invoice of row.invoices) {
        if (
          search &&
          ![invoice, row.document, ...row.orders, ...row.customers].some(
            (text) => text.toLowerCase().includes(search),
          )
        )
          continue;
        const group = invoiceGroups.get(invoice);
        if (group) group.push(row);
        else invoiceGroups.set(invoice, [row]);
      }
    }
  const shared = (orders: string[]) =>
    orders.length > 1 ? (
      <small className={ops.shared}>
        {tr("salesOps.sharedDocument", { count: orders.length })}
      </small>
    ) : null;
  const reference = (orders: string[]) => (
    <div className={ops.orderLinks}>
      {orders.map((order) => (
        <OrderLink key={order} order={order} onOrder={onOrder} />
      ))}
    </div>
  );
  const headers =
    stage === "shipments"
      ? (["document", "currency", "shippedAmount"] as const)
      : stage === "receivables"
        ? ([
            "document",
            "dueDate",
            "currency",
            "receivableAmount",
            "settledAmount",
            "unsettledAmount",
            "settlementStatus",
          ] as const)
        : stage === "payments"
          ? ([
              "receiptDocument",
              "receivables",
              "currency",
              "receivedAmount",
              "settledAmount",
              "sourceEntry",
            ] as const)
          : (["invoiceNumbers", "receivables"] as const);
  const displayRows = invoiceView
    ? [...invoiceGroups]
        .slice(page * pageSize, (page + 1) * pageSize)
        .map(([invoice, sources]) => ({
          key: invoice,
          cells: [
            invoice,
            [...new Set(sources.map(({ date }) => date))].join(" · "),
            sources.map(({ document }) => document).join(" · "),
            [...new Set(sources.flatMap((row) => row.customers))].join(" · ") ||
              "—",
            reference([...new Set(sources.flatMap((row) => row.orders))]),
          ],
        }))
    : matches.slice(page * pageSize, (page + 1) * pageSize).map((row) => {
        const code = opsCurrencyLabel[row.currency];
        const context = [
          row.customers.join(" · ") || "—",
          reference(row.orders),
        ];
        if ("receipt" in row)
          return {
            key: `${row.receipt}/${row.receivable}/${row.receivableEntry}`,
            cells: [
              row.receipt,
              row.date,
              row.receivable,
              code,
              money(row.received),
              money(row.settled),
              row.receivableEntry,
              ...context,
            ],
          };
        if ("invoices" in row)
          return {
            key: row.document,
            cells: [
              <span key={row.document}>
                {row.document}
                {shared(row.orders)}
              </span>,
              row.date,
              row.due || "—",
              code,
              money(row.amount),
              money(row.settled),
              money(row.balance),
              settlementLabel(row.status, tr),
              ...context,
            ],
          };
        return {
          key: `${row.document}/${row.currency}`,
          cells: [row.document, row.date, code, money(row.amount), ...context],
        };
      });
  return (
    <>
      <div className={ops.registerControls}>
        <label className={ops.field}>
          {tr("salesOps.weekFilter", { date: dateLabel })}
          <select
            value={week}
            onChange={(event) => {
              setWeek(event.target.value);
              setPage(0);
            }}
          >
            <option value="">{tr("salesOps.allWeeks")}</option>
            {weeks.map((start) => (
              <option key={start} value={start}>
                W{opsWeekNumber(start)} · {start}
              </option>
            ))}
          </select>
        </label>
        <label className={ops.field}>
          {tr("common.customer")}
          <select
            value={customer}
            onChange={(event) => {
              setCustomer(event.target.value);
              setPage(0);
            }}
          >
            <option value="">{tr("salesOps.allCustomers")}</option>
            {customers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <SearchInput
          label={tr("salesOps.findDocument")}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
        />
      </div>
      <p className={styles.note}>{tr(`salesOps.${stage}Note`)}</p>
      <RegisterTable
        headers={[
          tr(`salesOps.${headers[0]}`),
          dateLabel,
          ...headers.slice(1).map((header) => tr(`salesOps.${header}`)),
          tr("common.customer"),
          tr("salesOps.linkedOrders"),
        ]}
        rows={displayRows}
        empty={tr("salesOps.noDocuments")}
      />
      <RegisterPages
        count={invoiceView ? invoiceGroups.size : matches.length}
        page={page}
        onPage={setPage}
      />
    </>
  );
}

export function settlementLabel(
  text: string,
  tr: ReturnType<typeof useI18n>["tr"],
) {
  if (text === "全部核销") return tr("salesOps.fullySettled");
  if (text === "未核销") return tr("salesOps.notSettled");
  return text || "—";
}

function useMoney(locale: string) {
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (amount: number | null) =>
    amount === null ? "—" : number.format(amount);
}

function SearchInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={ops.search}>
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function OrderLink({
  order,
  onOrder,
}: {
  order: string;
  onOrder: (order: string) => void;
}) {
  return (
    <button
      className={ops.orderButton}
      type="button"
      onClick={() => onOrder(order)}
    >
      {order}
      <CircleChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

function RegisterTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
  empty: string;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th scope="col" key={i}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cells }) => (
            <tr key={key}>
              <th scope="row">{cells[0]}</th>
              {cells.slice(1).map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={headers.length} className={styles.empty}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegisterPages({
  count,
  page,
  onPage,
  orders,
}: {
  count: number;
  page: number;
  onPage: (page: number) => void;
  orders?: boolean;
}) {
  const { tr } = useI18n();
  const total = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className={ops.pagination}>
      <span role="status">
        {tr(orders ? "salesOps.page" : "salesOps.documentPage", {
          count,
          current: page + 1,
          total,
        })}
      </span>
      {total > 1 && (
        <>
          <button
            type="button"
            className="apac-button"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            {tr("salesOps.previous")}
          </button>
          <button
            type="button"
            className="apac-button"
            disabled={page + 1 >= total}
            onClick={() => onPage(page + 1)}
          >
            {tr("salesOps.next")}
          </button>
        </>
      )}
    </div>
  );
}
