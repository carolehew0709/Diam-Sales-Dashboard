import type { Dashboard } from "./dashboard";
import { displayText, translate, type Locale } from "./i18n";

export function performanceChartContext(data: Dashboard, locale: Locale) {
  const filters = data.filters;
  const tr = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const display = (value: string) => displayText(locale, value);
  return `${filters.year} · ${display(filters.region)} · ${filters.bu === "all" ? tr("filters.allBU") : filters.bu} · ${filters.salesType === "all" ? tr("filters.allSales") : display(filters.salesType)} · ${display(filters.scenario)} · ${filters.salesTeam === "all" || !filters.salesTeam ? tr("team.all") : filters.salesTeam} · ${data.weeks.map((w) => `W${w}`).join(" / ")} · ${filters.customer && filters.customer !== "all" ? filters.customer + " · " : ""}kEUR · ${[...new Set(data.rows.flatMap((r) => (r.snapshot ? [r.snapshot.sourceFile] : [])))].join("; ")}`;
}
