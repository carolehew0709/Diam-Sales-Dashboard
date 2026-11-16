"use client";

import { useState } from "react";
import { pipelineCurrencies, pipelineTotals, weekLabel } from "@/lib/pipeline";
import { isMessageKey } from "@/lib/i18n";
import { useI18n } from "./i18n-provider";
import styles from "./commercial.module.css";

type Review = {
  review: string;
  week: string;
  asOf: string;
  sheet: string;
  currencyConflicts: number;
  unchanged: boolean;
  scopes: {
    entity: string;
    previous: string | null;
    next: ReturnType<typeof pipelineTotals>;
  }[];
};

export function PipelineImport({
  onPublish,
}: {
  onPublish: (week: string) => void;
}) {
  const { tr, locale } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const upload = async (publish: boolean) => {
    if (!file || !date || pending || (publish && !review)) return;
    const form = new FormData();
    form.append("file", file);
    form.append("asOf", date);
    if (publish && review) form.append("review", review.review);
    setPending(true);
    setError("");
    setPublished(false);
    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setReview(null);
        throw new Error(result.error);
      }
      if (publish) {
        setReview(null);
        setPublished(true);
        onPublish(result.week);
      } else {
        setReview(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
    } finally {
      setPending(false);
    }
  };
  const [errorKey, row] = error.split(":");
  return (
    <details className={styles.panel}>
      <summary className={styles.summary}>{tr("pipeline.import")}</summary>
      <form
        className={styles.importForm}
        onSubmit={(event) => {
          event.preventDefault();
          void upload(false);
        }}
      >
        <label>
          {tr("pipeline.workbook")}
          <input
            type="file"
            accept=".xlsx"
            required
            disabled={pending}
            onChange={(event) => {
              setReview(null);
              setPublished(false);
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>
        <label>
          {tr("pipeline.asOf")}
          <input
            type="date"
            required
            value={date}
            disabled={pending}
            onChange={(event) => {
              setDate(event.target.value);
              setReview(null);
              setPublished(false);
            }}
          />
        </label>
        <button
          type="submit"
          className="apac-button"
          disabled={pending || !file || !date}
        >
          {tr(pending ? "auth.updating" : "pipeline.review")}
        </button>
      </form>
      {error && (
        <p role="alert">
          {tr(isMessageKey(errorKey) ? errorKey : "pipeline.requestFailed", {
            row: row ?? "",
          })}
        </p>
      )}
      {published && <p role="status">{tr("pipeline.published")}</p>}
      {review && (
        <div className={styles.review}>
          <strong>
            {file?.name} · {review.sheet} · {review.asOf} ·{" "}
            {weekLabel(review.week)}
          </strong>
          {review.scopes.map(({ entity, previous, next }) => (
            <p key={entity}>
              <strong>{entity}</strong> ·{" "}
              {tr(previous ? "pipeline.reviewExisting" : "pipeline.reviewNew", {
                date: previous ?? "",
              })}{" "}
              ·{" "}
              {tr("pipeline.reviewCount", {
                count: next.opportunities,
                missing: next.withoutAmount,
              })}{" "}
              ·{" "}
              {pipelineCurrencies
                .map(
                  (currency) =>
                    `${currency} ${next.amounts[currency] === null ? "—" : number.format(next.amounts[currency])}`,
                )
                .join(" · ")}
            </p>
          ))}
          {review.currencyConflicts > 0 && (
            <p>
              {tr("pipeline.currencyConflict", {
                count: review.currencyConflicts,
              })}
            </p>
          )}
          {review.unchanged ? (
            <p>{tr("pipeline.unchanged")}</p>
          ) : (
            <button
              type="button"
              className="apac-button primary"
              disabled={pending}
              onClick={() => void upload(true)}
            >
              {tr(pending ? "import.publishing" : "import.publish")}
            </button>
          )}
        </div>
      )}
    </details>
  );
}
