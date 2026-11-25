"use client";

import { useEffect, useState } from "react";
import type { Dashboard } from "@/lib/dashboard";
import { dashboardFilterKey } from "@/lib/dashboard-presentation";
import { useI18n } from "./i18n-provider";
import { TeamContributionGraphic } from "./sales-graphics";
import { TeamCustomerMonthlySales } from "./sales-trend-workspace";
import styles from "./sales-trend-workspace.module.css";

export function SalesTeamWorkspace({ data }: { data: Dashboard }) {
  const { tr } = useI18n();
  const [team, setTeam] = useState("all");
  const [customerSelection, setCustomerSelection] = useState<{
    entity: string;
    value: string;
  }>();
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const entity = `${data.filters.bu}/${data.filters.entity}`;
  const customer =
    customerSelection?.entity === entity ? customerSelection.value : "all";
  useEffect(() => {
    setCustomerSelection(undefined);
  }, [entity]);
  const isScoped = team !== "all" || customer !== "all";
  const scope = `${dashboardFilterKey(data.filters)}|${data.revision}`;
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(data.filters).map(([key, value]) => [key, String(value)]),
    ),
    salesTeam: team,
    customer,
    summary: "1",
  }).toString();
  const request = `${query}|${data.revision}`;
  const [response, setResponse] = useState<{
    request: string;
    scope: string;
    team: string;
    data?: Dashboard;
  }>();
  useEffect(() => {
    if (!isScoped) return;
    const controller = new AbortController();
    void fetch(`/api/dashboard?${query}`, { signal: controller.signal })
      .then(async (result) => {
        const payload = await result.json();
        if (!result.ok || !payload.ok) throw new Error();
        if (!controller.signal.aborted)
          setResponse({ request, scope, team, data: payload.data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResponse({ request, scope, team });
      });
    return () => controller.abort();
  }, [isScoped, query, request, scope, team]);
  const current = response?.request === request ? response : undefined;
  const previous = response?.scope === scope ? response : undefined;
  const pending = isScoped && !current;
  const failed = isScoped && current && !current.data;
  const visible = isScoped ? (current?.data ?? previous?.data ?? data) : data;
  const teams = new Set([
    ...data.salesTeams,
    ...(team === "all" ? [] : [team]),
  ]);
  const customers = new Set([
    ...(team === "all"
      ? data.customers
      : previous?.team === team
        ? (previous.data?.customers ?? [])
        : []),
    ...(customer === "all" ? [] : [customer]),
  ]);
  return (
    <div
      className={styles.workspace}
      aria-busy={pending}
      data-customer-status={failed ? "error" : pending ? "loading" : undefined}
    >
      <div className={styles.filters} aria-label={tr("team.scopeFilters")}>
        <label>
          {tr("team.label")}
          <select
            id="sales-team"
            value={team}
            onChange={(event) => {
              setTeam(event.target.value);
              setCustomerSelection(undefined);
            }}
          >
            <option value="all">{tr("team.all")}</option>
            {[...teams].sort().map((name) => (
              <option key={name} value={name}>
                {name === "__unassigned__" ? tr("team.unassigned") : name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("common.customer")}
          <select
            id="customer"
            title={tr("filters.customerSource")}
            value={customer}
            disabled={team !== "all" && pending && previous?.team !== team}
            onChange={(event) =>
              setCustomerSelection({ entity, value: event.target.value })
            }
          >
            <option value="all">{tr("filters.allAvailable")}</option>
            {[...customers].sort().map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      {pending && <p role="status">{tr("auth.updating")}</p>}
      {failed && <p role="alert">{tr("monthlyDetail.loadError")}</p>}
      <TeamContributionGraphic data={visible} />
      <details
        className="graphics-entity-details"
        open={monthlyOpen}
        onToggle={(event) => setMonthlyOpen(event.currentTarget.open)}
      >
        <summary>{tr("monthlyDetail.title")}</summary>
        {monthlyOpen && (
          <TeamCustomerMonthlySales
            data={data}
            team={team}
            customer={customer}
          />
        )}
      </details>
    </div>
  );
}
