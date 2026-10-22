"use client";
import {
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
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!svg.current || !exportTable) return;
    return registerWorkbookChart(svg.current, {
      name: sheetName ?? title,
      title,
      context,
      note,
      table: exportTable,
    });
  }, [svg, title, context, note, exportTable, sheetName]);
  const download = async (format: "png" | "svg") => {
    if (!svg.current) return;
    setBusy(true);
    setError(false);
    try {
      await downloadChart(svg.current, format, title, context, note);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
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
}: {
  title: string;
  context: string;
  note: string;
  children: ReactNode;
  className?: string;
  height?: number;
  table?: ReactNode;
  exportTable: ChartTable;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const tooltip = useChartTooltip(svg, exportTable);
  const { tr } = useI18n();
  return (
    <article className={`panel graphic-card ${className}`}>
      <div className="graphic-heading">
        <h3>{title}</h3>
        <ChartDownloads
          svg={svg}
          title={title}
          context={context}
          note={note}
          exportTable={exportTable}
        />
      </div>
      <p className="graphic-context">{context}</p>
      <div className="graphic-plot">
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
      <p className="graphic-note">{note}</p>
      {table && (
        <details className="graphic-data">
          <summary>{tr("graphics.viewData")}</summary>
          <div className="table-wrap">{table}</div>
        </details>
      )}
    </article>
  );
}
