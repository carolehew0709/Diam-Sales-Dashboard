"use client";

import { useMemo, useRef, useState } from "react";
import { Calculator, Download, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n";
import { quoteAmounts, readCostSheets, type CostInputs, type CostSheet, type QuoteLine } from "@/lib/quotation-workbook";
import { QuotationCostEditor } from "./quotation-cost-editor";
import styles from "./quotation.module.css";

const columns = ["item", "description", "picture", "size", "quantity", "cost", "unit", "amount"] as const;
const currencies = ["EUR", "SGD", "USD", "CNY", "HKD"] as const;
type Currency = (typeof currencies)[number];
type QuoteResult = { line: QuoteLine; cost?: number; unit?: number | null; cents?: number | null; error?: string };
const emptyStandards: CostInputs = {};
const blank = (id: number, sheet: string): QuoteLine => ({
  id, sheet, source: "D69", costUnits: "1", item: "", description: "", picture: null, size: "", quantity: "1", inputs: {},
});

async function readPicture(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/jpeg", 0.86), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

export default function QuotationApp() {
  const { tr, locale } = useI18n();
  const nextId = useRef(1);
  const [sheets, setSheets] = useState<CostSheet[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<MessageKey>();
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [activeId, setActiveId] = useState<number>();
  const [standards, setStandards] = useState<Record<string, CostInputs>>({});
  const [markup, setMarkup] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [exchange, setExchange] = useState("");
  const editor = useRef<HTMLDivElement>(null);

  const sheetByName = useMemo(() => new Map(sheets.map((sheet) => [sheet.name, sheet])), [sheets]);
  const active = lines.find((line) => line.id === activeId);
  const activeSheet = active ? sheetByName.get(active.sheet) : undefined;
  const fx = currency === "EUR" ? "1" : exchange;
  const results = useMemo<QuoteResult[]>(() => lines.map((line) => {
    const sheet = sheetByName.get(line.sheet);
    if (!sheet) return { line, error: "costSource" };
    try {
      return { line, ...quoteAmounts(sheet, line, markup, fx, standards[line.sheet]) };
    } catch (error) {
      return { line, error: (error as Error).message };
    }
  }), [lines, sheetByName, markup, fx, standards]);
  const complete = results.flatMap((row) =>
    row.line.item.trim() && row.cost !== undefined && row.unit != null && row.cents != null
      ? [{ line: row.line, cost: row.cost, unit: row.unit, cents: row.cents }]
      : [],
  );
  const sum = complete.reduce((total, row) => total + row.cents, 0);
  const total = complete.length > 0 && complete.length === lines.length && Number.isSafeInteger(sum) ? sum / 100 : null;
  const money = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code" });
  const price = (value: number | null | undefined) => value == null ? "—" : money.format(value);

  function updateLine(id: number, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  async function loadWorkbook(file: File) {
    setBusy(true);
    setNotice(undefined);
    try {
      const [{ read }, bytes] = await Promise.all([import("xlsx"), file.arrayBuffer()]);
      const found = readCostSheets(read(bytes, { cellFormula: true, cellHTML: false, cellText: false }));
      if (!found.length) {
        setNotice("quote.noSheets");
        return;
      }
      setSheets(found);
      setFileName(file.name);
      setStandards({});
      const first = blank(nextId.current++, found[0].name);
      setLines([first]);
      setActiveId(first.id);
    } catch {
      setNotice("quote.badWorkbook");
    } finally {
      setBusy(false);
    }
  }

  function addLine() {
    const line = blank(nextId.current++, active?.sheet ?? sheets[0].name);
    setLines((current) => [...current, line]);
    setActiveId(line.id);
  }

  async function attachPicture(id: number, file: File) {
    try {
      const picture = await readPicture(file);
      updateLine(id, { picture });
      setNotice(undefined);
    } catch {
      setNotice("quote.badPicture");
    }
  }

  async function download() {
    if (total === null) return;
    setExporting(true);
    setNotice(undefined);
    try {
      const { buildQuotationWorkbook } = await import("@/lib/quotation-export");
      const bytes = await buildQuotationWorkbook(complete, {
        title: tr("quote.title"),
        headers: columns.map((key) => tr(`quote.${key}`)),
        markup: Number(markup),
        markupLabel: tr("quote.markup"),
        currency,
        totalLabel: tr("quote.total"),
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "DIAM-quotation.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("quote.exportError");
    } finally {
      setExporting(false);
    }
  }

  const errors: Record<string, MessageKey> = {
    costSource: "quote.badCostSource",
    costUnits: "quote.badCostUnits",
    exchange: "quote.badExchange",
  };

  return (
    <div className={styles.workspace}>
      <header className={styles.hero}>
        <div>
          <h1><Calculator size={27} aria-hidden="true" />{tr("quote.title")}</h1>
          <p>{tr("quote.intro")}</p>
        </div>
        <label className={styles.filePicker}>
          <FileSpreadsheet size={17} aria-hidden="true" />
          <span>{tr(busy ? "quote.reading" : fileName ? "quote.replace" : "quote.chooseWorkbook")}</span>
          <input type="file" accept=".xlsx,.xlsm" disabled={busy} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void loadWorkbook(file);
          }} />
        </label>
      </header>
      {notice && <p className={styles.error} role="alert">{tr(notice)}</p>}
      {!fileName ? (
        <section className={styles.empty}><FileSpreadsheet size={31} aria-hidden="true" /><p>{tr("quote.empty")}</p></section>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="quote-lines">
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="quote-lines">{tr("quote.lines")}</h2>
                <p className={styles.fileName} title={fileName}>{fileName} · {tr("quote.sheetCount", { count: sheets.length })}</p>
              </div>
              <div className={styles.costControls}>
                <label>{tr("quote.markup")}
                  <input type="number" step="any" min="0" placeholder="5" value={markup} onChange={(event) => setMarkup(event.target.value)} />
                </label>
                <label>{tr("quote.currency")}
                  <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                    {currencies.map((name) => <option key={name}>{name}</option>)}
                  </select>
                </label>
                {currency !== "EUR" && <label>{tr("quote.exchange", { currency })}
                  <input type="number" step="any" min="0" value={exchange} onChange={(event) => setExchange(event.target.value)} />
                </label>}
              </div>
            </div>
            <div className={styles.scroll} role="region" tabIndex={0} aria-label={tr("quote.lines")}>
              <table className={styles.quoteTable}>
                <thead><tr>{columns.map((key) => <th scope="col" key={key}>{tr(`quote.${key}`)}</th>)}<th scope="col">{tr("quote.sheet")}</th><th scope="col">{tr("quote.actions")}</th></tr></thead>
                <tbody>
                  {results.map((row, index) => {
                    const { line } = row;
                    const label = (key: MessageKey) => `${index + 1} · ${tr(key)}`;
                    return (
                      <tr key={line.id} data-active={line.id === activeId}>
                        <td><input value={line.item} aria-label={label("quote.item")} onChange={(event) => updateLine(line.id, { item: event.target.value })} /></td>
                        <td><textarea value={line.description} aria-label={label("quote.description")} onChange={(event) => updateLine(line.id, { description: event.target.value })} /></td>
                        <td>
                          <label className={styles.picture}>
                            {line.picture ? <img src={line.picture.data} alt={line.item || tr("quote.picture")} /> : <span>{tr("quote.attach")}</span>}
                            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={label("quote.picture")} onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";
                              if (file) void attachPicture(line.id, file);
                            }} />
                          </label>
                          {line.picture && <button type="button" className={styles.textButton} onClick={() => updateLine(line.id, { picture: null })}>{tr("quote.removePic")}</button>}
                        </td>
                        <td><input value={line.size} aria-label={label("quote.size")} onChange={(event) => updateLine(line.id, { size: event.target.value })} /></td>
                        <td><input className={styles.quantity} type="number" min="1" step="1" value={line.quantity} aria-label={label("quote.quantity")} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} /></td>
                        <td className={styles.money}>
                          {price(row.cost)}
                          {row.error && <span className={styles.cellError}>{errors[row.error] ? tr(errors[row.error]) : row.error}</span>}
                        </td>
                        <td className={styles.money}>{price(row.unit)}</td>
                        <td className={styles.money}>{price(row.cents == null ? null : row.cents / 100)}</td>
                        <td><select value={line.sheet} aria-label={label("quote.sheet")} onChange={(event) => updateLine(line.id, { sheet: event.target.value, inputs: {}, source: "D69", costUnits: "1" })}>
                          {sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}
                        </select></td>
                        <td>
                          <div className={styles.rowActions}>
                            <button type="button" className={styles.textButton} aria-pressed={activeId === line.id} onClick={() => {
                              setActiveId(line.id);
                              editor.current?.scrollIntoView({ block: "start" });
                            }}>{tr("quote.editCost")}</button>
                            <button type="button" className={styles.textButton} aria-label={label("quote.removeLine")} onClick={() => {
                              const remaining = lines.filter((other) => other.id !== line.id);
                              setLines(remaining);
                              if (activeId === line.id) setActiveId(remaining[0]?.id);
                            }}><Trash2 size={15} aria-hidden="true" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.footer}>
              <button type="button" className="apac-button" onClick={addLine}><Plus size={15} />{tr("quote.addLine")}</button>
              <div className={styles.totals}>
                <div aria-live="polite" className={styles.total}>
                  <span>{tr("quote.total")}</span><strong>{price(total)}</strong>
                  {total === null && <small>{tr("quote.pending")}</small>}
                </div>
                <button type="button" className="apac-button primary" disabled={total === null || exporting} onClick={() => void download()}>
                  <Download size={15} />{tr(exporting ? "quote.exporting" : "quote.export")}
                </button>
              </div>
            </div>
          </section>
          <div ref={editor} className={styles.editor}>
            {active && activeSheet && <QuotationCostEditor
              sheet={activeSheet}
              line={active}
              update={(patch) => updateLine(active.id, patch)}
              standards={standards[active.sheet] ?? emptyStandards}
              updateStandards={(values) => setStandards((previous) => ({ ...previous, [active.sheet]: values }))}
            />}
          </div>
        </>
      )}
    </div>
  );
}
