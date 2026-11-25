"use client";

import { memo, useState } from "react";
import { salesNumber } from "@/lib/chart-tooltip";
import type { Dashboard } from "@/lib/dashboard";
import { rankedCustomerProspect } from "@/lib/key-customers";
import { useI18n } from "./i18n-provider";
import styles from "./sales-drilldown.module.css";

const limits = [4, 6, 10] as const;

export const KeyCustomerOrders = memo(function KeyCustomerOrders({
  data,
}: {
  data: Dashboard;
}) {
  const { tr, locale } = useI18n();
  const [limit, setLimit] = useState(6);
  const rows = rankedCustomerProspect(data.commercial).slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="panel commercial-panel key-customer-orders">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("commercial.exposure")}</p>
          <h3>{tr("commercial.title")}</h3>
          <p>
            {tr("graphics.weekly", {
              week:
                data.weeks.map((week) => `W${week}`).join(" / ") ||
                tr("snapshot.none"),
            })}{" "}
            · {data.filters.year} · kEUR
          </p>
        </div>
        <label className={styles.rankingControl}>
          <span>{tr("commercial.ranking")}</span>
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            {limits.map((count) => (
              <option key={count} value={count}>
                {tr("commercial.top", { count })}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length ? (
        <ol className={styles.rankings}>
          {rows.map((row, index) => (
            <li key={row.name}>
              <span className={styles.rank}>{index + 1}.</span>
              <div>
                <strong>{row.name}</strong>
                {row.sources.size > 1 && (
                  <small className={styles.aliases}>
                    {[...row.sources].join(" / ")}
                  </small>
                )}
              </div>
              <div className={styles.rankBar} aria-hidden="true">
                <i
                  style={{ width: `${Math.max(0, (row.value / max) * 100)}%` }}
                />
              </div>
              <strong className={styles.rankAmount}>
                {salesNumber(row.value, locale)} <small>kEUR</small>
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p>{tr("commercial.empty")}</p>
      )}
      <div className="panel-foot">{tr("commercial.note")}</div>
    </section>
  );
});
