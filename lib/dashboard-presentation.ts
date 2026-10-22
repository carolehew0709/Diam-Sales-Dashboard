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
