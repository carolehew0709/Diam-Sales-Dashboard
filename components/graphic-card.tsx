"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Download } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { downloadChart } from "@/lib/chart-export";
import { registerWorkbookChart } from "@/lib/chart-workbook-registry";
import type { ChartTable } from "@/lib/chart-workbook-types";
import { useChartTooltip } from "./chart-interaction";
import { useDataReveal } from "./use-data-reveal";
import { ExportAccess } from "./export-access";
import { salesNumber } from "@/lib/chart-tooltip";

export const SalesChartPresentation = createContext(false);

export function ChartDownloads({
  svg,
  title,
  context,
  note,
  exportTable,
  sheetName,
}: {
  svg: RefObject<SVGSVGElement>;
  title: string;
  context: string;
  note: string;
  exportTable?: ChartTable;
  sheetName?: string;
}) {
  const { tr, locale } = useI18n();
  const showDataInImage = useContext(SalesChartPresentation);
  const exportAllowed = useContext(ExportAccess);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [waiting, setWaiting] = useState(false);
  useEffect(() => setWaiting(false), [context, exportTable]);
  useEffect(() => {
    if (!exportAllowed || !svg.current || !exportTable) return;
    return registerWorkbookChart(svg.current, {
      name: sheetName ?? title,
      title,
      context,
      note,
      table: exportTable,
    });
  }, [exportAllowed, svg, title, context, note, exportTable, sheetName]);
  const download = async (format: "png" | "svg") => {
    if (!exportAllowed || !svg.current) return;
    if (
      svg.current.closest(
        '[aria-busy="true"], [data-customer-status="loading"]',
      )
    ) {
      setWaiting(true);
      return;
    }
    setWaiting(false);
    setBusy(true);
    setError(false);
    try {
      await downloadChart(
        svg.current,
        format,
        title,
        context,
        note,
        showDataInImage && exportTable
          ? { table: exportTable, locale, heading: tr("graphics.viewData") }
          : undefined,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (!exportAllowed) return null;
  return (
    <div
      className="graphic-downloads"
      role="group"
      aria-label={tr("graphics.downloadFor", { title })}
    >
      {(["png", "svg"] as const).map((format) => (
        <button
          key={format}
          type="button"
          disabled={busy}
          title={tr("graphics.downloadFor", { title })}
          aria-label={`${tr("graphics.download")} ${format.toUpperCase()} · ${title}`}
          onClick={() => void download(format)}
        >
          <Download size={12} aria-hidden="true" />
          {format.toUpperCase()}
        </button>
      ))}
      {error && <span role="alert">{tr("graphics.downloadError")}</span>}
      {waiting && <span role="status">{tr("graphics.workbookWait")}</span>}
    </div>
  );
}

export function GraphicCard({
  title,
  context,
  note,
  children,
  className = "",
  height = 360,
  table,
  exportTable,
  notice,
  exportNote,
}: {
  title: string;
  context: string;
  note: string;
  children: ReactNode;
  className?: string;
  height?: number;
  table?: ReactNode;
  exportTable: ChartTable;
  notice?: string;
  exportNote?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  useDataReveal(plot, JSON.stringify([context, exportTable]));
  const tooltip = useChartTooltip(svg, exportTable);
  const { tr, locale } = useI18n();
  const collapseNotes = useContext(SalesChartPresentation);
  return (
    <article className={`panel graphic-card ${className}`}>
      <div className="graphic-heading">
        <h3>{title}</h3>
        <ChartDownloads
          svg={svg}
          title={title}
          context={context}
          note={exportNote ?? note}
          exportTable={exportTable}
        />
      </div>
      <p className="graphic-context">{context}</p>
      {notice && <p className="graphic-filter-note">{notice}</p>}
      <div className="graphic-plot" ref={plot}>
        <svg
          ref={svg}
          viewBox={`0 0 800 ${height}`}
          role="group"
          aria-label={title}
          fontFamily="Arial, 'Microsoft YaHei', sans-serif"
          fontSize="13"
          fill="#171813"
        >
          {children}
        </svg>
      </div>
      {tooltip}
      {!collapseNotes && <p className="graphic-note">{note}</p>}
      {(table || (collapseNotes && note)) && (
        <details className="graphic-data">
          <summary>{tr("graphics.viewData")}</summary>
          <div className="table-wrap">
            {table ?? (
              <table className="bu-table">
                <thead>
                  <tr>
                    {exportTable.columns.map(({ label }, i) => (
                      <th key={i}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exportTable.rows.map((row, index) => (
                    <tr key={index}>
                      {exportTable.columns.map(({ format }, i) => {
                        const value = row[i];
                        return (
                          <td key={i}>
                            {typeof value === "number"
                              ? salesNumber(
                                  value,
                                  locale,
                                  2,
                                  format?.includes("%") ? "percent" : "decimal",
                                )
                              : (value ?? "—")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {collapseNotes && <p className="graphic-note">{note}</p>}
        </details>
      )}
    </article>
  );
}
