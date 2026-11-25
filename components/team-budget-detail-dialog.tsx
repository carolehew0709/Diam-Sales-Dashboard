"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { salesNumber } from "@/lib/chart-tooltip";
import type { teamBudgetDetails } from "@/lib/team-budget-details";
import type { Filters } from "@/lib/types";
import { useI18n } from "./i18n-provider";
import styles from "./sales-drilldown.module.css";

type Detail = ReturnType<typeof teamBudgetDetails>;

export function TeamBudgetDetailDialog({
  team,
  filters,
  revision,
  onClose,
}: {
  team: string;
  filters: Filters;
  revision: number;
  onClose: () => void;
}) {
  const { tr, display, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState<"refresh" | "load">();
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filters).map(([key, value]) => [key, String(value)]),
    ),
    salesTeam: team,
    revision: String(revision),
  }).toString();
  useEffect(() => {
    const modal = dialog.current;
    if (!modal?.open) modal?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/team-budget-details?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 409) {
          setError("refresh");
          return;
        }
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setDetail(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load");
      });
    return () => controller.abort();
  }, [query]);
  const money = (value: number | null) => salesNumber(value, locale, 2);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={id}
      onClose={onClose}
    >
      <header className={styles.dialogHeader}>
        <h2 id={id}>{tr("teamActual.detailTitle", { team })}</h2>
        <button
          type="button"
          className="apac-button"
          aria-label={tr("snapshot.close")}
          onClick={() => dialog.current?.close()}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      {error ? (
        <p role="alert">
          {tr(
            error === "refresh"
              ? "teamActual.detailRefresh"
              : "teamActual.detailError",
          )}
        </p>
      ) : detail === undefined ? (
        <p role="status">{tr("auth.updating")}</p>
      ) : !detail ? (
        <p>{tr("teamActual.detailUnavailable")}</p>
      ) : (
        <>
          <section className={styles.detailSection}>
            <h3>{tr("teamActual.detailActuals")}</h3>
            <p>
              {tr("teamActual.period", {
                year: detail.actual.year,
                month: String(detail.actual.month).padStart(2, "0"),
              })}
              {detail.actual.reportingWeek
                ? ` · W${detail.actual.reportingWeek}`
                : ""}
              {" · "}
              {detail.actual.sourceFile} · {detail.actual.sourceSheet}
            </p>
            <div
              className={styles.tableScroll}
              tabIndex={0}
              aria-label={tr("teamActual.detailActuals")}
            >
              <table className="bu-table">
                <thead>
                  <tr>
                    <th>{tr("teamActual.billTo")}</th>
                    <th>{tr("common.buEntity")}</th>
                    <th>{tr("filters.type")}</th>
                    <th className="numeric">{tr("teamActual.sales")} (kEUR)</th>
                    <th className="numeric">
                      {tr("teamActual.budget")} (kEUR)
                    </th>
                    <th className="numeric">{tr("teamActual.attainment")}</th>
                    <th className="numeric">{tr("teamActual.detailRow")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.actual.rows.map((row) => (
                    <tr key={row.sourceRow}>
                      <td>{row.customer || "—"}</td>
                      <td>{row.entity}</td>
                      <td>{display(row.salesType)}</td>
                      <td className="numeric">{money(row.sales)}</td>
                      <td className="numeric">{money(row.budget)}</td>
                      <td className="numeric">
                        {salesNumber(
                          row.budget && row.budget > 0
                            ? row.sales / row.budget
                            : null,
                          locale,
                          2,
                          "percent",
                        )}
                      </td>
                      <td className="numeric">{row.sourceRow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={styles.detailSection}>
            <h3>{tr("teamActual.detailBrands")}</h3>
            <p>{tr("teamActual.detailBrandSource")}</p>
            {detail.brands.length ? (
              <div
                className={styles.tableScroll}
                tabIndex={0}
                aria-label={tr("teamActual.detailBrands")}
              >
                <table className="bu-table">
                  <thead>
                    <tr>
                      <th>{tr("teamActual.billTo")}</th>
                      <th>{tr("teamActual.brand")}</th>
                      <th>{tr("common.buEntity")}</th>
                      <th className="numeric">{tr("metric.ob")} (kEUR)</th>
                      <th>{tr("common.source")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.brands.map((row) => (
                      <tr
                        key={JSON.stringify([
                          row.entity,
                          row.customer,
                          row.brand,
                          row.week,
                          row.sourceFile,
                          row.sourceSheet,
                        ])}
                      >
                        <td>{row.customer || "—"}</td>
                        <td>{row.brand || "—"}</td>
                        <td>{row.entity}</td>
                        <td className="numeric">{money(row.amount)}</td>
                        <td>
                          W{row.week} · {row.sourceFile} · {row.sourceSheet}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{tr("commercial.empty")}</p>
            )}
          </section>
        </>
      )}
    </dialog>
  );
}
