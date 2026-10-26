"use client";
import { useState } from "react";
import type { Dashboard } from "@/lib/dashboard";
import { formatK } from "@/lib/dashboard";
import { keyCustomerOrderbook } from "@/lib/key-customers";
import { useI18n } from "./i18n-provider";

export function KeyCustomerOrders({ data }: { data: Dashboard }) {
  const { tr } = useI18n();
  const [customer, setCustomer] = useState("all");
  const rows = keyCustomerOrderbook(data.commercial);
  const max = Math.max(1, ...rows.flatMap((row) => row.value === null ? [] : [row.value]));
  return (
    <section className="panel commercial-panel key-customer-orders">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("commercial.exposure")}</p>
          <h3>{tr("commercial.title")}</h3>
          <p>{tr("graphics.weekly", { week: data.weeks.map((week) => `W${week}`).join(" / ") || tr("snapshot.none") })} · {data.filters.year} · kEUR</p>
        </div>
        <label className="commercial-filter">
          <span>{tr("common.customer")}</span>
          <select value={customer} onChange={(event) => setCustomer(event.target.value)}>
            <option value="all">{tr("filters.allAvailable")}</option>
            {rows.map((row) => <option key={row.name}>{row.name}</option>)}
          </select>
        </label>
      </div>
      <div className="commercial-grid">
        {rows.filter((row) => customer === "all" || row.name === customer).map((row) => (
          <div className="apac-commercial" key={row.name}>
            <span>{row.name}</span>
            <strong>{formatK(row.value)} <small>kEUR</small></strong>
            <div><i style={{ width: `${Math.max(0, (row.value ?? 0) / max * 100)}%` }} /></div>
            {row.value === null ? <small>{tr("commercial.empty")}</small> : <small>{row.sources.join(" / ")}</small>}
          </div>
        ))}
      </div>
      <div className="panel-foot">{tr("commercial.note")}</div>
    </section>
  );
}
