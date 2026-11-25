"use client";

import { useRef, useState } from "react";
import type { SalesOperationsView } from "@/lib/sales-operations";
import { opsExportKinds } from "@/lib/sales-operations-types";
import { isMessageKey } from "@/lib/i18n";
import { useI18n } from "./i18n-provider";
import { opsCurrencyLabel } from "./sales-operations-register";
import styles from "./commercial.module.css";
import ops from "./sales-operations.module.css";

type ImportSummary = Pick<
  SalesOperationsView,
  | "from"
  | "asOf"
  | "shipmentCount"
  | "receivableCount"
  | "invoiceCount"
  | "receiptCount"
  | "missingOrderAmounts"
  | "currencies"
> & { orders: number };
type ImportReview = {
  review: string;
  previous: ImportSummary | null;
  next: ImportSummary;
  unchanged: boolean;
};

export function SalesOperationsImport({
  onPublish,
}: {
  onPublish: (snapshot: SalesOperationsView) => void;
}) {
  const { tr, locale } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  const [review, setReview] = useState<ImportReview>();
  const [pending, setPending] = useState<"review" | "publish">();
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState(false);
  const money = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  async function submit(phase: "review" | "publish") {
    if (!form.current || pending || !form.current.reportValidity()) return;
    const body = new FormData(form.current);
    if (phase === "publish") {
      if (!review || review.unchanged) return;
      body.set("review", review.review);
    } else {
      setReview(undefined);
    }
    setError(undefined);
    setComplete(false);
    setPending(phase);
    try {
      const response = await fetch("/api/sales-operations", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setReview(undefined);
        setError(result.error || "salesOps.importError");
        return;
      }
      if (phase === "publish") {
        onPublish(result.data);
        setReview(undefined);
        setComplete(true);
        form.current?.reset();
      } else {
        setReview(result);
      }
    } catch {
      setError("salesOps.importError");
    } finally {
      setPending(undefined);
    }
  }

  const summarize = (summary: ImportSummary | null) => ({
    range: summary ? `${summary.from} – ${summary.asOf}` : "—",
    counts: summary
      ? [
          summary.orders,
          summary.shipmentCount,
          summary.receivableCount,
          summary.invoiceCount,
          summary.receiptCount,
          summary.missingOrderAmounts,
        ]
      : [],
  });

  return (
    <section className={styles.panel} aria-label={tr("salesOps.importTitle")}>
      <h2>{tr("salesOps.importTitle")}</h2>
      <p className={styles.note}>{tr("salesOps.importScope")}</p>
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit("review");
        }}
        onChange={() => {
          setReview(undefined);
          setComplete(false);
          setError(undefined);
        }}
      >
        <fieldset className={ops.importFields} disabled={!!pending}>
          {opsExportKinds.map((kind) => (
            <label key={kind} className={ops.field}>
              {tr(`salesOps.import.${kind}`)}
              <input type="file" name={kind} accept=".xlsx" required />
            </label>
          ))}
        </fieldset>
        <button className="apac-button" type="submit" disabled={!!pending}>
          {tr(pending === "review" ? "auth.loading" : "salesOps.importReview")}
        </button>
      </form>
      {error && <p role="alert">{isMessageKey(error) ? tr(error) : error}</p>}
      {complete && <p role="status">{tr("salesOps.importDone")}</p>}
      {review && (
        <div className={ops.importReview}>
          <h3>{tr("salesOps.importCompare")}</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">DDC</th>
                  <th scope="col">{tr("salesOps.importCurrent")}</th>
                  <th scope="col">{tr("salesOps.importIncoming")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{tr("salesOps.importPeriod")}</th>
                  <td>{summarize(review.previous).range}</td>
                  <td>{summarize(review.next).range}</td>
                </tr>
                {(
                  [
                    "orderCount",
                    "shipmentCount",
                    "receivables",
                    "invoiceReferences",
                    "payments",
                    "missingAmountCount",
                  ] as const
                ).map((metric, i) => (
                  <tr key={metric}>
                    <th scope="row">{tr(`salesOps.${metric}`)}</th>
                    <td>{summarize(review.previous).counts[i] ?? "—"}</td>
                    <td>{summarize(review.next).counts[i]}</td>
                  </tr>
                ))}
                {[
                  ...new Set(
                    [
                      ...(review.previous?.currencies ?? []),
                      ...review.next.currencies,
                    ].map((row) => row.currency),
                  ),
                ].flatMap((currency) =>
                  (["ordered", "shipped", "open", "matchedCash"] as const).map(
                    (measure) => {
                      const previous = review.previous?.currencies.find(
                        (row) => row.currency === currency,
                      )?.[measure];
                      const next = review.next.currencies.find(
                        (row) => row.currency === currency,
                      )?.[measure];
                      const key =
                        measure === "ordered"
                          ? "orderedAmount"
                          : measure === "shipped"
                            ? "shippedAmount"
                            : measure === "open"
                              ? "openSnapshot"
                              : "matchedCash";
                      return (
                        <tr key={currency + measure}>
                          <th scope="row">
                            {tr(`salesOps.${key}`)} ·{" "}
                            {opsCurrencyLabel[currency]}
                          </th>
                          <td>
                            {previous == null ? "—" : money.format(previous)}
                          </td>
                          <td>{next == null ? "—" : money.format(next)}</td>
                        </tr>
                      );
                    },
                  ),
                )}
              </tbody>
            </table>
          </div>
          {review.unchanged ? (
            <p role="status">{tr("salesOps.importUnchanged")}</p>
          ) : (
            <button
              className="apac-button"
              type="button"
              disabled={!!pending}
              onClick={() => {
                void submit("publish");
              }}
            >
              {tr(
                pending === "publish"
                  ? "auth.loading"
                  : "salesOps.importPublish",
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
