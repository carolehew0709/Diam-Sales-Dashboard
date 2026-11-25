"use client";
import { useContext, useId, useRef, useState, type RefObject } from "react";
import { ExportAccess } from "./export-access";
import { FileSpreadsheet } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { collectWorkbookCharts } from "@/lib/chart-workbook-registry";
import { chartPng, saveChartFile } from "@/lib/chart-export";
import type { ChartWorkbookImage } from "@/lib/chart-workbook-types";
import { collectWorkbookGroups } from "@/lib/chart-workbook-groups";
import { isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import styles from "./sales-performance.module.css";

export function ChartWorkbookExport({
  layoutLabel = "graphics.workbookLayout",
  dashboardRoot,
  disabled = false,
}: {
  layoutLabel?: MessageKey;
  dashboardRoot?: RefObject<HTMLElement>;
  disabled?: boolean;
} = {}) {
  const { tr, locale } = useI18n();
  const exportAllowed = useContext(ExportAccess);
  const [chosenLanguage, setChosenLanguage] = useState<Locale>();
  const language = chosenLanguage ?? locale;
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draftLanguage, setDraftLanguage] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const run = async (exportLanguage = language) => {
    const root =
      dashboardRoot?.current ??
      button.current?.closest<HTMLElement>(".dashboard-route");
    if (!exportAllowed || !root || busy || disabled) return;
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
    const sourceCharts = collectWorkbookCharts(root);
    const groups = collectWorkbookGroups(root);
    if (!sourceCharts.length || !groups.length) {
      setError(tr("graphics.workbookError"));
      return;
    }
    const workbookPage = root.dataset.workbookPage;
    const wasCurrent = () =>
      root.isConnected &&
      root.dataset.workbookPage === workbookPage &&
      root.getAttribute("aria-busy") !== "true" &&
      !root.querySelector(
        '[data-customer-status="loading"], [data-customer-status="error"]',
      ) &&
      sourceCharts.every(
        (c) =>
          c.svg.isConnected &&
          collectWorkbookCharts(root).some(
            (current) => current.svg === c.svg && current.sheet === c.sheet,
          ),
      );
    setBusy(true);
    setError("");
    setProgress({ done: 0, total: sourceCharts.length });
    let dispose: (() => void) | undefined;
    try {
      // Spreadsheet code is loaded only when requested; dashboard startup stays light.
      const [writer, renderer] = await Promise.all([
        import("@/lib/chart-workbook"),
        import("./chart-workbook-stage"),
      ]);
      if (!wasCurrent()) throw new Error("Filters changed");
      const prepared = await renderer.prepareWorkbookCharts(
        groups,
        exportLanguage,
      );
      dispose = prepared.dispose;
      const charts = prepared.charts;
      if (charts.length !== sourceCharts.length)
        throw new Error("Incomplete localized charts");
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
      const bytes = await writer.createChartWorkbook(sheets, exportLanguage);
      if (!wasCurrent()) throw new Error("Filters changed");
      saveChartFile(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `DIAM-Charts-${new Date().toISOString().slice(0, 10)}-${exportLanguage}.xlsx`,
      );
    } catch {
      setError(tr("graphics.workbookError"));
    } finally {
      dispose?.();
      setBusy(false);
    }
  };
  if (!exportAllowed) return null;
  return (
    <div
      className={`chart-workbook-export ${dashboardRoot ? styles.toolbarExport : ""}`}
    >
      {!dashboardRoot && (
        <label className="chart-workbook-language">
          {tr("graphics.workbookLanguage")}
          <select
            aria-label={tr("graphics.workbookLanguage")}
            value={language}
            disabled={busy}
            onChange={(event) => {
              if (isLocale(event.target.value))
                setChosenLanguage(event.target.value);
            }}
          >
            <option value="en">{tr("graphics.workbookEnglish")}</option>
            <option value="zh-CN">{tr("graphics.workbookChinese")}</option>
          </select>
        </label>
      )}
      <button
        ref={button}
        type="button"
        className={dashboardRoot ? "excel-export" : "apac-button"}
        disabled={busy || disabled}
        aria-label={dashboardRoot ? tr("nav.export") : undefined}
        aria-haspopup={dashboardRoot ? "dialog" : undefined}
        onClick={() => {
          if (!dashboardRoot) {
            void run();
            return;
          }
          setDraftLanguage(language);
          setError("");
          dialog.current?.showModal();
        }}
      >
        <FileSpreadsheet size={16} aria-hidden="true" />
        <span>
          {busy
            ? tr("graphics.workbookProgress", progress)
            : tr(dashboardRoot ? "nav.export" : "graphics.workbookDownload")}
        </span>
      </button>
      {!dashboardRoot && <small>{tr(layoutLabel)}</small>}
      {dashboardRoot && (
        <dialog
          ref={dialog}
          className={styles.exportDialog}
          aria-labelledby={titleId}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || disabled) return;
              dialog.current?.close();
              setChosenLanguage(draftLanguage);
              void run(draftLanguage);
            }}
          >
            <h2 id={titleId}>{tr("graphics.workbookLanguage")}</h2>
            <p className={styles.exportScope}>{tr("graphics.workbookCurrentPage")}</p>
            <div
              role="group"
              aria-labelledby={titleId}
              className={styles.exportChoices}
            >
              {(["en", "zh-CN"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={titleId}
                    value={value}
                    checked={draftLanguage === value}
                    onChange={() => setDraftLanguage(value)}
                  />
                  {tr(
                    value === "en"
                      ? "graphics.workbookEnglish"
                      : "graphics.workbookChinese",
                  )}
                </label>
              ))}
            </div>
            <div className={styles.exportDialogActions}>
              <button
                className="apac-button"
                type="button"
                onClick={() => dialog.current?.close()}
              >
                {tr("common.cancel")}
              </button>
              <button
                className="apac-button primary"
                type="submit"
                disabled={busy || disabled}
              >
                {tr("nav.export")}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
