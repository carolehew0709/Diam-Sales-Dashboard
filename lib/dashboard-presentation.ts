import type { Amount, Filters } from "./types";

/** One identity for all scope-changing controls, including omitted default team. */
export function dashboardFilterKey(filters: Filters) {
  return JSON.stringify([
    filters.region,
    filters.bu,
    filters.entity,
    filters.year,
    filters.salesType,
    filters.scenario,
    filters.salesTeam ?? "all",
  ]);
}

/** Customer source is monthly and independent of the weekly Sales/Prospect toggle. */
export function customerAnalysisQuery(filters: Filters, month: string) {
  return new URLSearchParams({
    region: filters.region,
    bu: filters.bu,
    entity: filters.entity,
    year: String(filters.year),
    salesType: filters.salesType,
    salesTeam: filters.salesTeam ?? "all",
    month,
  }).toString();
}

export function showProspectForecast(
  filters: Pick<Filters, "scenario">,
  metrics: { base: Amount; scenario: Amount; prospect: Amount },
) {
  return (
    filters.scenario === "Sales + Prospect" &&
    metrics.prospect !== null &&
    metrics.prospect !== 0 &&
    metrics.scenario !== null &&
    metrics.scenario !== metrics.base
  );
}
