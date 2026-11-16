"use client";

import { useState } from "react";
import { ClipboardList, CreditCard, ReceiptText, Truck } from "lucide-react";
import { useI18n } from "./i18n-provider";
import styles from "./commercial.module.css";

const stages = [
  ["salesOps.order", ClipboardList],
  ["salesOps.shipment", Truck],
  ["salesOps.invoice", ReceiptText],
  ["salesOps.payment", CreditCard],
] as const;
const views = [
  "salesOps.byTeam",
  "salesOps.byWeek",
  "salesOps.byGroup",
] as const;

export function SalesOperations() {
  const { tr } = useI18n();
  const [view, setView] = useState<(typeof views)[number]>("salesOps.byTeam");
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <h1>{tr("salesOps.title")}</h1>
          <p>{tr("salesOps.homeDescription")}</p>
        </div>
        <span className={styles.status}>{tr("salesOps.awaitingErp")}</span>
      </header>
      <ol className={styles.flow} aria-label={tr("salesOps.workflow")}>
        {stages.map(([name, Icon]) => (
          <li key={name}>
            <Icon size={22} aria-hidden="true" />
            <strong>{tr(name)}</strong>
            <span>—</span>
          </li>
        ))}
      </ol>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <h2>{tr("salesOps.workflow")}</h2>
          <div
            className={styles.segments}
            role="group"
            aria-label={tr("salesOps.viewBy")}
          >
            {views.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {tr(key)}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{tr(view)}</th>
                {stages.map(([name]) => (
                  <th key={name} scope="col">
                    {tr(name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {tr("salesOps.empty")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
