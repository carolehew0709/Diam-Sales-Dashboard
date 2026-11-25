import { entities, matchesRegion } from "./entities";
import { latestFiscalSnapshot, lineYear } from "./fiscal-years";
import { excludesGroupProspect, reportingState } from "./intercompany";
import { canView } from "./permissions";
import { reportingPeriod } from "./reporting-period";
import { teamActualView, teamNamesState } from "./team-actuals";
import { retainedTeamView } from "./team-reporting";
import { matchesOrderDimensions } from "./sales-teams";
import type { Filters, Store, User } from "./types";

export function teamBudgetDetails(state: Store, user: User, filters: Filters) {
  state = reportingPeriod(state, filters.week);
  const actual = teamActualView(state, user, filters, { includeRows: true });
  if (!actual?.detailRows?.length) return null;
  const allowed = entities.filter(
    (entity) =>
      canView(user, entity) &&
      matchesRegion(entity, filters.region) &&
      (filters.bu === "all" ||
        filters.bu === entity.businessUnit ||
        (filters.bu === "DHK" && entity.id === "dhk")) &&
      (filters.entity === "all" || filters.entity === entity.id),
  );
  const entityCodes = new Map(
    allowed.map((entity) => [entity.id, entity.code]),
  );
  const retained = retainedTeamView(state, user, filters);
  let orders = retained?.lines;
  if (!orders) {
    const report = reportingState(teamNamesState(state), filters.salesType);
    const snapshots = new Map(
      allowed.map(({ id }) => [
        id,
        latestFiscalSnapshot(report, id, filters.year),
      ]),
    );
    orders = report.lines.filter((line) => {
      const snapshot = snapshots.get(line.entityId);
      return (
        snapshot?.year === line.year &&
        snapshot.week === line.week &&
        (filters.salesType === "all" ||
          line.customerType.toLowerCase() === filters.salesType) &&
        matchesOrderDimensions(line, filters.salesTeam, filters.customer)
      );
    });
  }

  const brands = new Map<
    string,
    {
      entity: string;
      customer: string;
      brand: string;
      week: number;
      sourceFile: string;
      sourceSheet: string;
      amount: number | null;
    }
  >();
  for (const line of orders) {
    const entity = entityCodes.get(line.entityId);
    if (!entity || excludesGroupProspect(line, filters.year)) continue;
    const customer = line.customer?.trim() || "";
    const brand = line.product?.trim() || "";
    const key = JSON.stringify([
      entity,
      customer,
      brand,
      line.week,
      line.sourceFile,
      line.sourceSheet,
    ]);
    const previous = brands.get(key);
    const amount = lineYear(line, filters.year).total;
    brands.set(key, {
      entity,
      customer,
      brand,
      week: line.week,
      sourceFile: line.sourceFile,
      sourceSheet: line.sourceSheet,
      amount:
        amount == null
          ? (previous?.amount ?? null)
          : (previous?.amount ?? 0) + amount,
    });
  }
  return {
    actual: {
      rows: actual.detailRows
        .map((row) => ({
          entity: entityCodes.get(row.entityId) ?? row.entityId,
          customer: row.customer,
          salesType: row.salesType,
          sales: row.ytd,
          budget: row.budget,
          sourceRow: row.sourceRow,
        }))
        .sort(
          (a, b) => b.sales - a.sales || a.customer.localeCompare(b.customer),
        ),
      sourceFile: actual.sourceFile,
      sourceSheet: actual.sourceSheet,
      year: actual.year,
      month: actual.month,
      reportingWeek: actual.reportingWeek,
    },
    brands: [...brands.values()].sort(
      (a, b) =>
        (b.amount ?? -Infinity) - (a.amount ?? -Infinity) ||
        a.customer.localeCompare(b.customer) ||
        a.brand.localeCompare(b.brand),
    ),
  };
}
