"use client";

import { useMemo, useState } from "react";
import { paymentBalances, type PaymentBalanceRow } from "@/lib/receivables";
import { useI18n } from "./i18n-provider";
import { arAmountFormatter, arUnit } from "./receivables-display";
import styles from "./receivables-filters.module.css";

export function UnknownPayments({
  allowed,
  rows,
}: {
  allowed: boolean;
  rows: PaymentBalanceRow[];
}) {
  const { tr, locale } = useI18n();
  const [customer, setCustomer] = useState("");
  const [category, setCategory] = useState<PaymentBalanceRow["category"] | "">(
    "",
  );
  const customers = useMemo(
    () =>
      [...new Set(rows.map((row) => row.customer).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, locale),
      ),
    [rows, locale],
  );
  const selectedCustomer = customers.includes(customer) ? customer : "";
  const summary = useMemo(
    () => paymentBalances(rows, selectedCustomer, category),
    [rows, selectedCustomer, category],
  );
  const amount = arAmountFormatter(locale);
  const columns = category
    ? [category]
    : (["unknown", "advance", "total"] as const);
  return (
    <section className="panel ar-detail" aria-labelledby="ar-payment-title">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("ar.sharedReceipts")}</p>
          <h2 id="ar-payment-title">{tr("ar.unknownPaymentTitle")}</h2>
        </div>
        {allowed && (
          <span aria-live="polite">
            {summary.count === 1
              ? tr("ar.oneReceipt")
              : tr("ar.receiptCount", { count: summary.count })}
          </span>
        )}
      </div>
      {allowed ? (
        <>
          <div className={styles.paymentFilters}>
            <label className="filter-field">
              {tr("ar.paymentCustomer")}
              <select
                value={selectedCustomer}
                onChange={(event) => setCustomer(event.target.value)}
              >
                <option value="">{tr("ar.all")}</option>
                {customers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-field">
              <span id="ar-payment-category">{tr("ar.column.category")}</span>
              <div
                className="segmented"
                role="group"
                aria-labelledby="ar-payment-category"
              >
                {(["", "unknown", "advance"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={category === value ? "is-active" : undefined}
                    aria-pressed={category === value}
                    onClick={() => setCategory(value)}
                  >
                    {tr(value ? `ar.paymentFilter.${value}` : "ar.all")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className={styles.paymentContext}>{tr("ar.paymentFilterNote")}</p>
          {summary.latestDate && (
            <p className={styles.paymentContext}>
              {tr("ar.latestReceiptDate")}:{" "}
              <time dateTime={summary.latestDate}>{summary.latestDate}</time>
            </p>
          )}
          {summary.balances.length ? (
            <div className="table-wrap">
              <table
                className={`bu-table receipt-balances ${styles.paymentTable}`}
              >
                <caption>{tr("ar.receiptSummary")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{tr("ar.currency")}</th>
                    {columns.map((column) => (
                      <th key={column} scope="col" className="numeric">
                        {tr(
                          column === "total"
                            ? "ar.receiptTotal"
                            : `ar.category.${column}`,
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.balances.map((row) => (
                    <tr key={row.currency}>
                      <th scope="row" className={styles.unitLabel}>
                        {arUnit(row.currency)}
                      </th>
                      {columns.map((column) => (
                        <td key={column} className="numeric">
                          <strong>{amount(row[column])}</strong>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ar-empty">{tr("ar.noMatches")}</p>
          )}
        </>
      ) : (
        <p>{tr("ar.sharedAccess")}</p>
      )}
    </section>
  );
}
