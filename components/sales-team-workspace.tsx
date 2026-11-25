"use client";

import { useEffect, useRef, useState } from "react";
import type { Dashboard } from "@/lib/dashboard";
import { dashboardFilterKey } from "@/lib/dashboard-presentation";
import { DashboardFilters } from "./dashboard-filters";
import { useI18n } from "./i18n-provider";
import { TeamBudgetGraphic } from "./team-actual-graphics";
import { TeamPerformanceGraphic } from "./team-performance-graphic";
import { TeamCustomerMonthlySales } from "./sales-trend-workspace";
import { useWorkbookGroup } from "./use-workbook-group";
import pageStyles from "./sales-performance.module.css";
import styles from "./sales-trend-workspace.module.css";

export function SalesTeamWorkspace({ data }: { data: Dashboard }) {
  const { tr } = useI18n();
  const { bu, entity: entityId, region, year, salesType } = data.filters;
  const scopeKey = JSON.stringify([region, year, salesType]);
  const entity = `${bu}/${entityId}`;
  const [selection, setSelection] = useState({
    scopeKey,
    entity,
    team: "all",
    customer: "all",
  });
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const scopeChanged = selection.scopeKey !== scopeKey;
  const team = scopeChanged ? "all" : selection.team;
  const customer =
    scopeChanged || selection.entity !== entity ? "all" : selection.customer;
  // Reset dependent values without remounting the top bar and losing focus.
  if (scopeChanged || selection.entity !== entity) {
    setSelection({ scopeKey, entity, team, customer });
    if (scopeChanged) setMonthlyOpen(false);
  }
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
  const teamFilters = (
    <>
      <div className="filter-field">
        <label htmlFor="sales-team">{tr("team.label")}</label>
        <select
          id="sales-team"
          value={team}
          onChange={(event) =>
            setSelection({
              ...selection,
              team: event.target.value,
              customer: "all",
            })
          }
        >
          <option value="all">{tr("team.all")}</option>
          {[...teams].sort().map((name) => (
            <option key={name} value={name}>
              {name === "__unassigned__" ? tr("team.unassigned") : name}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="customer">{tr("common.customer")}</label>
        <select
          id="customer"
          title={tr("filters.customerSource")}
          value={customer}
          disabled={team !== "all" && pending && previous?.team !== team}
          onChange={(event) =>
            setSelection({ ...selection, customer: event.target.value })
          }
        >
          <option value="all">{tr("filters.allAvailable")}</option>
          {[...customers].sort().map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>
    </>
  );
  return (
    <>
      <DashboardFilters data={data} teamFilters={teamFilters} />
      <section
        id="sales-team-section"
        className={`graphics-section ${pageStyles.section}`}
        aria-labelledby="orderbook-graphics-title"
      >
        <div className="graphics-section-heading">
          <div>
            <p className="panel-kicker">
              {tr(
                data.graphics.teamActuals
                  ? "teamActual.sectionKicker"
                  : "graphics.obKicker",
              )}
            </p>
            <h2 id="orderbook-graphics-title">
              {tr(
                data.graphics.teamActuals
                  ? "teamActual.sectionTitle"
                  : "graphics.obTitle",
              )}
            </h2>
          </div>
        </div>
        <div
          className={styles.workspace}
          aria-busy={pending}
          data-customer-status={
            failed ? "error" : pending ? "loading" : undefined
          }
        >
          {pending && <p role="status">{tr("auth.updating")}</p>}
          {failed && <p role="alert">{tr("monthlyDetail.loadError")}</p>}
          <TeamSalesGraphics data={visible} />
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
      </section>
    </>
  );
}

function TeamSalesGraphics({
  data,
  exportOnly = false,
}: {
  data: Dashboard;
  exportOnly?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useWorkbookGroup(
    root,
    exportOnly ? null : () => <TeamSalesGraphics data={data} exportOnly />,
  );
  return (
    <div ref={root} className="team-contribution-graphic">
      <TeamPerformanceGraphic data={data} />
      <TeamBudgetGraphic data={data} interactive={!exportOnly} />
    </div>
  );
}
