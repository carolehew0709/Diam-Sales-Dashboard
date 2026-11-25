"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { SalesOperationsOrder } from "@/lib/sales-operations";
import type { OpsAmountBasis } from "@/lib/sales-operations-types";
import { useI18n } from "./i18n-provider";
import { settlementLabel } from "./sales-operations-register";
import styles from "./commercial.module.css";
import ops from "./sales-operations.module.css";

export function SalesOperationsOrderDialog({
  order,
  basis,
  onClose,
}: {
  order: string;
  basis: OpsAmountBasis;
  onClose: () => void;
}) {
  const { tr, locale } = useI18n();
  const modal = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [detail, setDetail] = useState<SalesOperationsOrder>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!modal.current?.open) modal.current?.showModal();
    const controller = new AbortController();
    const params = new URLSearchParams({ order, basis });
    void fetch(`/api/sales-operations?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setDetail(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [order, basis]);
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (amount: number | null) =>
    amount === null ? "—" : nf.format(amount);
  const currency = (code: string) =>
    code === "CNY"
      ? "RMB"
      : code === "PENDING"
        ? tr("salesOps.pricePending")
        : code;
  const unitPrice = new Intl.NumberFormat(locale, { maximumFractionDigits: 8 });
  return (
    <dialog
      ref={modal}
      className={ops.dialog}
      aria-labelledby={heading}
      onClose={onClose}
    >
      <header className={ops.dialogHeader}>
        <div>
          <h2 id={heading}>{order}</h2>
          {detail && (
            <p>
              {detail.customer} · {detail.date} ·{" "}
              {detail.currencies.map(currency).join(" / ")}
            </p>
          )}
        </div>
        <button
          type="button"
          className="apac-button"
          aria-label={tr("snapshot.close")}
          onClick={() => modal.current?.close()}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      {error ? (
        <p role="alert">{tr("salesOps.orderUnavailable")}</p>
      ) : !detail ? (
        <p role="status">{tr("auth.loading")}</p>
      ) : (
        <>
          <DetailTable
            title={tr("salesOps.orderLines")}
            headers={[
              tr("salesOps.line"),
              tr("salesOps.item"),
              tr("team.label"),
              tr("salesOps.quantity"),
              tr("salesOps.openQuantity"),
              ...(detail.useOriginalPrices
                ? [
                    tr("salesOps.currency"),
                    tr("salesOps.originalOrder"),
                    tr("salesOps.originalUnitPrice"),
                  ]
                : []),
              tr("salesOps.orderedAmount"),
              tr("salesOps.shippedAmount"),
              tr("salesOps.openSnapshot"),
              tr("salesOps.sourceRow"),
            ]}
            rows={detail.lines.map((row) => [
              row.line,
              [row.item, row.description].filter(Boolean).join(" · "),
              row.reportingTeam ? (
                <span title={row.team ?? undefined}>{row.reportingTeam}</span>
              ) : (
                tr("team.unassigned")
              ),
              row.quantity,
              row.openQuantity,
              ...(detail.useOriginalPrices
                ? [
                    currency(row.currency),
                    row.originalPrice
                      ? `${row.originalPrice.originalOrder} · ${tr("salesOps.sourceRow")} ${row.originalPrice.sourceRows.join(", ")}`
                      : "—",
                    row.originalPrice
                      ? unitPrice.format(row.originalPrice.grossUnitPrice)
                      : "—",
                  ]
                : []),
              money(row.ordered),
              money(row.shipped),
              money(row.open),
              row.sourceRow,
            ])}
          />
          <DetailTable
            title={tr("salesOps.shipmentDetail")}
            headers={[
              tr("salesOps.document"),
              tr("salesOps.date"),
              tr("salesOps.line"),
              tr("salesOps.quantity"),
              ...(detail.useOriginalPrices ? [tr("salesOps.currency")] : []),
              tr("salesOps.shippedAmount"),
              tr("salesOps.sourceRow"),
            ]}
            rows={detail.shipments.map((row) => [
              row.document,
              row.date,
              row.line,
              row.quantity,
              ...(detail.useOriginalPrices ? [currency(row.currency)] : []),
              money(row.amount),
              row.sourceRow,
            ])}
            empty={tr("salesOps.noShipment")}
          />
          <DetailTable
            title={tr("salesOps.receivableDetail")}
            headers={[
              tr("salesOps.document"),
              tr("salesOps.receivableDate"),
              tr("salesOps.dueDate"),
              tr("salesOps.line"),
              tr("salesOps.currency"),
              tr("salesOps.documentAmount"),
              tr("salesOps.documentSettled"),
              tr("salesOps.documentBalance"),
              tr("salesOps.settlementStatus"),
              tr("salesOps.invoiceNumbers"),
            ]}
            rows={detail.receivables.map((row) => [
              <span>
                {row.document}
                {row.linkedOrderCount > 1 && (
                  <small className={ops.shared}>
                    {tr("salesOps.sharedOrderReceivable", {
                      count: row.linkedOrderCount,
                    })}
                  </small>
                )}
              </span>,
              row.date,
              row.due || "—",
              detail.links
                .filter(({ document }) => document === row.document)
                .map(({ line }) => line)
                .join(", "),
              currency(row.currency),
              money(row.amount),
              money(row.settled),
              money(row.balance),
              settlementLabel(row.status, tr),
              row.invoices.join(" / ") || "—",
            ])}
            empty={tr("salesOps.noReceivable")}
            note={tr("salesOps.invoiceCaveat")}
          />
          <DetailTable
            title={tr("salesOps.matchedCash")}
            headers={[
              tr("salesOps.receiptDocument"),
              tr("salesOps.document"),
              tr("salesOps.date"),
              tr("salesOps.currency"),
              tr("salesOps.receivedAmount"),
              tr("salesOps.settledAmount"),
              tr("salesOps.sourceEntry"),
            ]}
            rows={detail.payments.map((row) => [
              row.receipt,
              row.receivable,
              row.date,
              currency(row.currency),
              money(row.received),
              money(row.settled),
              row.receivableEntry,
            ])}
            empty={tr("salesOps.noPaymentMatch")}
            note={tr("salesOps.paymentCaveat")}
          />
        </>
      )}
    </dialog>
  );
}

function DetailTable({
  title,
  headers,
  rows,
  empty,
  note,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
  note?: string;
}) {
  return (
    <section className={ops.detail}>
      <h3>{title}</h3>
      {note && <p className={styles.note}>{note}</p>}
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((name) => (
                  <th scope="col" key={name}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.note}>{empty}</p>
      )}
    </section>
  );
}
