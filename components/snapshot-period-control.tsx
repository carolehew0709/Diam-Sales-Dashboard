"use client";
import { useContext } from "react";
import { DashboardFilterState } from "./dashboard-filters";
import { useI18n } from "./i18n-provider";
import type { Dashboard } from "@/lib/dashboard";

export function SnapshotPeriodControl({
  data,
  onSelect,
}: {
  data: Dashboard;
  onSelect: () => void;
}) {
  const state = useContext(DashboardFilterState);
  if (!state) throw new Error("DashboardFilterState is required");
  const { tr } = useI18n();
  const selected = state.filters.week ?? 0;
  const weeks = data.availableWeeks;
  const previous = weeks.find(
    (week) => week < (selected || Math.max(0, ...data.weeks)),
  );
  const choose = (week: number) => {
    state.setFilters((current) => ({ ...current, week }));
    onSelect();
  };
  return (
    <section
      className="snapshot-period-control"
      aria-labelledby="snapshot-period-title"
    >
      <h3 id="snapshot-period-title">{tr("history.week")}</h3>
      <div className="snapshot-period-actions">
        <button
          type="button"
          className="snapshot-latest"
          aria-pressed={selected === 0}
          onClick={() => choose(0)}
        >
          {tr("history.latest")}
        </button>
        <button
          type="button"
          className="snapshot-previous"
          disabled={previous === undefined}
          onClick={() => previous !== undefined && choose(previous)}
        >
          {tr("history.previous")}
        </button>
      </div>
      <div
        className="snapshot-week-grid"
        role="group"
        aria-label={tr("history.available")}
      >
        {weeks.map((week) => (
          <button
            type="button"
            key={week}
            aria-pressed={selected === week}
            onClick={() => choose(week)}
          >
            W{week}
          </button>
        ))}
      </div>
      {!weeks.length && <p>{tr("history.none")}</p>}
      <p className="snapshot-period-note">
        {tr(selected ? "history.readOnly" : "history.choose")}
      </p>
    </section>
  );
}
