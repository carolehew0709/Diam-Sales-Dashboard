"use client";

import { useEffect, useRef, useState } from "react";
import { integerAxis } from "@/lib/chart-axis";
import type { ReceivablesTrends as TrendData } from "@/lib/receivables-trends";
import { useI18n } from "./i18n-provider";
import { arAmountFormatter, arThousands, arUnit } from "./receivables-display";
import styles from "./receivables-filters.module.css";

const colors = ["#9b681f", "#346e9c", "#2f8064", "#ac5255", "#765690"];

function TrendPanel({
  months,
  panel,
}: {
  months: TrendData["months"];
  panel: TrendData["panels"][number];
}) {
  const { tr, locale } = useI18n();
  const [selection, setSelection] = useState("top");
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(608);
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const measure = () =>
      setWidth(Math.max(240, Math.floor(element.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const groups = selection === "top" ? panel.top : [selection.slice(6)];
  const series = groups.flatMap((name) => {
    const group = panel.series.find((item) => item.name === name);
    return group ? [group] : [];
  });
  const amountLabel = arAmountFormatter(locale);
  const axisNumber = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  });
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const { min, max, ticks } = integerAxis(
    series.flatMap((group) =>
      group.values.map((amount) =>
        amount === null ? null : arThousands(amount),
      ),
    ),
  );
  const start = 68,
    end = width - 19;
  const x = (i: number) =>
    months.length === 1
      ? (start + end) / 2
      : start + (i * (end - start)) / (months.length - 1);
  const y = (thousands: number) =>
    210 - ((thousands - min) / (max - min)) * 185;
  const name = `${panel.entityCode} · ${arUnit(panel.currency)}`;
  const chartTitle = tr("ar.trendChartLabel", { scope: name });
  return (
    <article
      className="panel"
      data-ar-trend={panel.entityCode}
      data-currency={panel.currency}
    >
      <div className="panel-heading">
        <div>
          <h3>{name}</h3>
          <p className={styles.trendCaption}>
            {tr("ar.trendSourceDate", { date: panel.latestDate })}
          </p>
        </div>
        <select
          className={styles.trendSelect}
          aria-label={tr("ar.trendGroupFilter", { scope: name })}
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
        >
          <option value="top">{tr("ar.trendTop5")}</option>
          {panel.series.map((group) => (
            <option key={group.name} value={`group:${group.name}`}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
      {panel.observedMonths === 1 && (
        <p className={styles.trendCaption}>{tr("ar.trendSingleMonth")}</p>
      )}
      <div ref={plot} className={styles.trendPlot}>
        <svg viewBox={`0 0 ${width} 246`} role="img" aria-label={chartTitle}>
          {ticks.map((tick) => (
            <g key={tick} className={styles.trendAxis}>
              <line x1={start} x2={end} y1={y(tick)} y2={y(tick)} />
              <text x={start - 7} y={y(tick) + 4} textAnchor="end">
                {axisNumber.format(tick)}
              </text>
            </g>
          ))}
          {months.map(
            (month, i) =>
              (width >= 400 ||
                i % 2 === (months.length - 1) % 2 ||
                i === 0) && (
                <text
                  className={styles.trendAxis}
                  key={month}
                  x={x(i)}
                  y={231}
                  textAnchor="middle"
                >
                  {monthLabel.format(new Date(`${month}-01T00:00:00Z`))}
                </text>
              ),
          )}
          {series.map((group, index) => {
            const color = colors[index % colors.length];
            const line = group.values
              .map((value, i) =>
                value === null
                  ? ""
                  : `${i > 0 && group.values[i - 1] !== null ? "L" : "M"} ${x(i)} ${y(arThousands(value))}`,
              )
              .join(" ");
            return (
              <g key={group.name}>
                <path d={line} fill="none" stroke={color} strokeWidth={2.5} />
                {group.values.map((value, i) => {
                  if (value === null) return null;
                  const label = `${group.name} · ${months[i]} · ${amountLabel(value)} ${arUnit(panel.currency)}`;
                  return (
                    <circle
                      key={months[i]}
                      cx={x(i)}
                      cy={y(arThousands(value))}
                      r={4}
                      fill={color}
                      role="img"
                      tabIndex={0}
                      aria-label={label}
                    >
                      <title>{label}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className={styles.trendLegend}>
        {series.map((group, index) => {
          const latest = group.values.findLastIndex((value) => value !== null);
          return (
            <li key={group.name}>
              <i style={{ background: colors[index % colors.length] }} />
              <span>{group.name}</span>
              {latest >= 0 && (
                <strong title={months[latest]}>
                  {amountLabel(group.values[latest]!)}
                </strong>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function ReceivablesTrends() {
  const { tr } = useI18n();
  const [data, setData] = useState<TrendData>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setError(false);
    void fetch("/api/receivables/trends", { signal: request.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("AR trend request failed");
        const result = await response.json();
        if (!request.signal.aborted) setData(result.data);
      })
      .catch(() => {
        if (!request.signal.aborted) setError(true);
      });
    return () => request.abort();
  }, [retry]);
  return (
    <section className={styles.trends} aria-busy={!data && !error}>
      <div className="panel-heading">
        <div>
          <h2>
            {tr("ar.trend")}
            {data ? ` · ${data.year}` : ""}
          </h2>
          <p className={styles.trendCaption}>{tr("ar.trendBasis")}</p>
        </div>
      </div>
      {error && (
        <div role="alert">
          {tr("ar.trendError")}{" "}
          <button
            className="apac-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            {tr("common.retry")}
          </button>
        </div>
      )}
      {!data && !error && <p role="status">{tr("ar.trendLoading")}</p>}
      {data && (
        <div className="ar-chart-grid">
          {data.entities.map((entity) => {
            const panels = data.panels.filter(
              (panel) => panel.entityId === entity.id,
            );
            return panels.length > 0 ? (
              panels.map((panel) => (
                <TrendPanel
                  key={`${panel.entityId}:${panel.currency}`}
                  months={data.months}
                  panel={panel}
                />
              ))
            ) : (
              <article
                className="panel"
                key={entity.id}
                data-ar-trend={entity.code}
              >
                <h3>{entity.code}</h3>
                <p>{tr("ar.trendUnavailable")}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
