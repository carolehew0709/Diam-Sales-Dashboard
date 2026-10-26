"use client";
import { memo } from "react";
import type { Dashboard } from "@/lib/dashboard";
import { formatK } from "@/lib/dashboard";
import { keyCustomerOrderbook } from "@/lib/key-customers";
import { useI18n } from "./i18n-provider";

export const KeyCustomerOrders = memo(function KeyCustomerOrders({ data }: { data: Dashboard }) {
  const { tr } = useI18n();
  const customerScoped = !!data.filters.customer && data.filters.customer !== "all";
  const rows = keyCustomerOrderbook(data.commercial).filter((row) => !customerScoped || row.sources.length > 0);
  const max = Math.max(1, ...rows.flatMap((row) => row.value === null ? [] : [row.value]));
  return (
    <section className="panel commercial-panel key-customer-orders">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{tr("commercial.exposure")}</p>
          <h3>{tr("commercial.title")}</h3>
          <p>{tr("graphics.weekly", { week: data.weeks.map((week) => `W${week}`).join(" / ") || tr("snapshot.none") })} · {data.filters.year} · {data.filters.salesTeam === "all" ? tr("team.all") : data.filters.salesTeam} · {data.filters.customer === "all" || !data.filters.customer ? tr("filters.allAvailable") : data.filters.customer} · kEUR</p>
        </div>

      </div>
      <div className="commercial-grid">
        {rows.map((row) => (
          <div className="apac-commercial" key={row.name}>
            <span>{row.name}</span>
            <strong>{formatK(row.value)} <small>kEUR</small></strong>
            <div><i style={{ width: `${Math.max(0, (row.value ?? 0) / max * 100)}%` }} /></div>
            {row.value === null ? <small>{tr("commercial.empty")}</small> : <small>{row.sources.join(" / ")}</small>}
          </div>
        ))}
      </div>
      {!rows.length && <p>{tr("commercial.empty")}</p>}
      <div className="panel-foot">{tr("commercial.note")}</div>
    </section>
  );
});
