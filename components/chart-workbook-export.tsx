"use client";
import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { collectWorkbookCharts } from "@/lib/chart-workbook-registry";
import { chartPng, saveChartFile } from "@/lib/chart-export";
import type { ChartWorkbookImage } from "@/lib/chart-workbook-types";

export function ChartWorkbookExport() {
  const { tr } = useI18n();
  const button = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const run = async () => {
    const root = button.current?.closest<HTMLElement>(".dashboard-route");
    if (!root || busy) return;
    if (
      root.getAttribute("aria-busy") === "true" ||
      root.querySelector('[data-customer-status="loading"]')
    ) {
      setError(tr("graphics.workbookWait"));
      return;
    }
    if (root.querySelector('[data-customer-status="error"]')) {
      setError(tr("graphics.workbookSourceError"));
      return;
    }
    const charts = collectWorkbookCharts(root);
    if (!charts.length) {
      setError(tr("graphics.workbookError"));
      return;
    }
    const wasCurrent = () =>
      root.isConnected &&
      root.getAttribute("aria-busy") !== "true" &&
      charts.every(
        (c) =>
          c.svg.isConnected &&
          collectWorkbookCharts(root).some(
            (current) => current.svg === c.svg && current.sheet === c.sheet,
          ),
      );
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: charts.length });
    try {
      // Spreadsheet code is loaded only when requested; dashboard startup stays light.
      const writer = await import("@/lib/chart-workbook");
      const sheets: ChartWorkbookImage[] = [];
      for (const { svg, sheet } of charts) {
        if (!wasCurrent()) throw new Error("Filters changed");
        const image = await chartPng(
          svg,
          sheet.title,
          sheet.context,
          sheet.note,
        );
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(image.blob);
        });
        sheets.push({
          ...sheet,
          image: dataUrl,
          imageWidth: image.width,
          imageHeight: image.height,
        });
        setProgress({ done: sheets.length, total: charts.length });
      }
      const bytes = await writer.createChartWorkbook(sheets);
      if (!wasCurrent()) throw new Error("Filters changed");
      saveChartFile(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `DIAM-Charts-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch {
      setError(tr("graphics.workbookError"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chart-workbook-export">
      <button
        ref={button}
        type="button"
        className="apac-button"
        disabled={busy}
        onClick={() => void run()}
      >
        <FileSpreadsheet size={16} aria-hidden="true" />
        {busy
          ? tr("graphics.workbookProgress", progress)
          : tr("graphics.workbookDownload")}
      </button>
      <small>{tr("graphics.workbookLayout")}</small>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
