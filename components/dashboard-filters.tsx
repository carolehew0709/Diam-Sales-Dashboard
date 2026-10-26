"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useI18n } from "./i18n-provider";
import { UpdateStatus } from "./update-status";
import { matchesRegion } from "@/lib/entities";
import type { Dashboard } from "@/lib/dashboard";
import type { Filters } from "@/lib/types";

export const DashboardFilterState = createContext<{
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  pending: boolean;
} | null>(null);

export function Segmented({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  columns?: string;
}) {
  return (
    <div className="filter-field">
      <span className="filter-label">{label}</span>
      <div
        className="segmented"
        style={{
          gridTemplateColumns: columns ?? `repeat(${options.length},1fr)`,
        }}
        role="group"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            aria-pressed={value === o.value}
            className={value === o.value ? "is-active" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
/** Draft controls update immediately; the memoized dashboard keeps its applied snapshot. */
export function DashboardFilters({ data }: { data: Dashboard }) {
  const state = useContext(DashboardFilterState);
  if (!state) throw new Error("DashboardFilterState is required");
  const { filters: requestedFilters, setFilters, pending } = state;
  const { tr, display } = useI18n();
  const t = data.totals;
  const filterBar = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = filterBar.current;
    if (!element) return;
    const measure = () => {
      if (element.isConnected)
        document.documentElement.style.setProperty(
          "--dashboard-filter-height",
          `${element.getBoundingClientRect().height}px`,
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--dashboard-filter-height",
      );
    };
  }, []);
  return (
    <section
      className="filter-bar sales-filter-bar"
      ref={filterBar}
      data-updating={pending || undefined}
      aria-label={tr("filters.global")}
    >
      <div className="filter-field">
        <label htmlFor="region">{tr("filters.region")}</label>
        <select
          id="region"
          value={requestedFilters.region}
          onChange={(e) =>
            setFilters({
              ...requestedFilters,
              region: e.target.value,
              bu: "all",
              entity: "all",
              salesTeam: "all",
              customer: "all",
            })
          }
        >
          {data.regions.map((r) => (
            <option key={r} value={r}>
              {r === "APAC" ? tr("filters.apac") : display(r)}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="bu">{tr("filters.businessUnitEntity")}</label>
        <select
          id="bu"
          value={requestedFilters.bu}
          onChange={(e) =>
            setFilters({
              ...requestedFilters,
              bu: e.target.value,
              entity: "all",
              salesTeam: "all",
              customer: "all",
            })
          }
        >
          <option value="all">{tr("filters.allBU")}</option>
          {[
            ...new Set(
              data.entities
                .filter((e) => matchesRegion(e, requestedFilters.region))
                .map((e) => e.businessUnit),
            ),
          ].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="sales-team">{tr("team.label")}</label>
        <select
          id="sales-team"
          value={requestedFilters.salesTeam ?? "all"}
          onChange={(event) =>
            setFilters({
              ...requestedFilters,
              salesTeam: event.target.value,
              customer: "all",
            })
          }
        >
          <option value="all">{tr("team.all")}</option>
          {data.salesTeams.map((team) => (
            <option key={team} value={team}>
              {team === "__unassigned__" ? tr("team.unassigned") : team}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="customer">{tr("common.customer")}</label>
        <select
          id="customer"
          title={tr("filters.customerSource")}
          value={requestedFilters.customer ?? "all"}
          onChange={(event) =>
            setFilters({ ...requestedFilters, customer: event.target.value })
          }
        >
          <option value="all">{tr("filters.allAvailable")}</option>
          {data.customers.map((customer) => (
            <option key={customer} value={customer}>
              {customer}
            </option>
          ))}
        </select>
      </div>
      <Segmented
        label={tr("filters.years")}
        value={String(requestedFilters.year)}
        options={[
          { value: "2026", label: "2026" },
          { value: "2027", label: "2027" },
        ]}
        onChange={(v) =>
          setFilters({
            ...requestedFilters,
            year: Number(v),
            salesTeam: "all",
            customer: "all",
          })
        }
      />
      <Segmented
        label={tr("filters.scenario")}
        columns="minmax(48px,.6fr) minmax(0,1.4fr)"
        value={requestedFilters.scenario}
        options={[
          { value: "Sales", label: tr("metric.sales") },
          {
            value: "Sales + Prospect",
            label: tr(
              t.prospect !== null && t.prospect !== 0
                ? "metric.salesProspectP1"
                : "metric.salesProspect",
            ),
          },
        ]}
        onChange={(v) =>
          setFilters({
            ...requestedFilters,
            scenario: v as Filters["scenario"],
          })
        }
      />
      <Segmented
        label={tr("filters.type")}
        value={requestedFilters.salesType}
        options={[
          { value: "all", label: tr("filters.allSales") },
          { value: "external", label: tr("common.external") },
          { value: "group", label: tr("common.group") },
        ]}
        onChange={(v) =>
          setFilters({
            ...requestedFilters,
            salesType: v as Filters["salesType"],
            salesTeam: "all",
            customer: "all",
          })
        }
      />
      <UpdateStatus pending={pending} />
    </section>
  );
}
