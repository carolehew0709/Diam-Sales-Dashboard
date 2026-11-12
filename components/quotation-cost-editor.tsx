"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { calculateCosts, processStandardAddresses, type CostInputs, type CostSheet, type QuoteLine } from "@/lib/quotation-workbook";
import styles from "./quotation.module.css";

const columns = [..."ABCDEFGHIJKLMNOPQRSTU"];
const partInputRows = new Set([7, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 23, 26, 29, 32, 33, 34, 38, 39, 40, 41, 45, 46, 47, 48, 49, 50, 51, 53, 54, 58]);
const summaryInputs = new Set(["C2", "I2", "S4", "T4", "S6", "T7", "C63", "C64", "C65", "C66", "C67", "C68", "Q66", "R66", "S66", "Q67", "R67", "S67", "S69", "S70"]);
const textInputs = new Set(["C2", "I2", "S6", "T7"]);

export function QuotationCostEditor({ sheet, line, update, standards, updateStandards }: {
  sheet: CostSheet;
  line: QuoteLine;
  update: (patch: Partial<QuoteLine>) => void;
  standards: CostInputs;
  updateStandards: (standards: CostInputs) => void;
}) {
  const { tr, locale } = useI18n();
  const calc = useMemo(() => calculateCosts(sheet, line.inputs, standards), [sheet, line.inputs, standards]);
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }), [locale]);
  const rates = processStandardAddresses(sheet);
  const rows = Array.from({ length: 70 }, (_, index) => index + 1).filter((row) =>
    columns.some((column) => sheet.cells[column + row] || summaryInputs.has(column + row)),
  );

  function renderCell(column: string, row: number) {
    const address = column + row;
    const cell = sheet.cells[address];
    const label = `${sheet.name}!${address} · ${sheet.cells["A" + row]?.value ?? ""}`;
    if (cell?.formula || rates.includes(address)) {
      try {
        const result = calc.value(address);
        const text = address === "A4" && typeof result === "number"
          ? new Date((result - 25569) * 86400000).toLocaleString(locale)
          : typeof result === "number" ? formatter.format(result) : result == null ? "" : String(result);
        return <output aria-label={label} title={cell?.formula ? `${address} =${cell.formula}` : address}>{text}</output>;
      } catch (error) {
        return <output className={styles.cellError} aria-label={label} title={cell?.formula}>{String((error as Error).message)}</output>;
      }
    }
    const partInput = column >= "C" && column <= "R" && partInputRows.has(row);
    const freeInput = typeof cell?.value === "number" && row !== 8;
    if (partInput || freeInput || summaryInputs.has(address)) {
      const type = textInputs.has(address) || row === 7 || row === 11 ||
        (typeof cell?.value === "string" && !Number.isFinite(Number(cell.value))) ? "text" : "number";
      return <input
        aria-label={label}
        title={address}
        data-cell={address}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={line.inputs[address] ?? cell?.value?.toString() ?? ""}
        onChange={(event) => update({ inputs: { ...line.inputs, [address]: event.target.value } })}
      />;
    }
    return cell?.value == null ? null : <span title={String(cell.value)}>{String(cell.value)}</span>;
  }

  return (
    <section className={styles.panel} aria-labelledby="quote-cost-editor">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="quote-cost-editor">{tr("quote.costEditor", { item: line.item || sheet.name })}</h2>
          <p>{tr("quote.costEditorHint", { sheet: sheet.name })}</p>
        </div>
        <div className={styles.costControls}>
          <label>{tr("quote.costSource")}
            <input value={line.source} onChange={(event) => update({ source: event.target.value })} placeholder="D69" />
          </label>
          <label>{tr("quote.costUnits")}
            <input type="number" min="1" step="1" value={line.costUnits} onChange={(event) => update({ costUnits: event.target.value })} />
          </label>
        </div>
      </div>
      <p className={styles.note}>{tr("quote.costSourceHint")}</p>
      {rates.length > 0 && (
        <section className={styles.rates} aria-labelledby="quote-standards">
          <div className={styles.sectionHeading}>
            <h3 id="quote-standards">{tr("quote.rates")}</h3>
            <button type="button" className="apac-button" disabled={!Object.keys(standards).length} onClick={() => updateStandards({})}>
              {tr("quote.resetRates")}
            </button>
          </div>
          <p>{tr("quote.rateHint")}</p>
          <div className={styles.rateFields}>
            {rates.map((address) => {
              let value = standards[address] ?? "";
              if (standards[address] === undefined) {
                try {
                  value = String(calc.value(address) ?? "");
                } catch {
                  value = "";
                }
              }
              return (
                <label key={address}>
                  {address} · {sheet.cells[`A${address.slice(1)}`]?.value || tr("quote.rate")}
                  <input
                    data-standard={address}
                    type="number"
                    step="any"
                    min="0"
                    value={value}
                    title={sheet.cells[address].formula}
                    onChange={(event) => updateStandards({ ...standards, [address]: event.target.value })}
                  />
                </label>
              );
            })}
          </div>
        </section>
      )}
      <div className={styles.scroll} role="region" tabIndex={0} aria-label={tr("quote.grid")}>
        <table className={styles.grid}>
          <thead><tr><th scope="col">#</th>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                {columns.map((column) => (
                  <td key={column} className={sheet.cells[column + row]?.formula ? styles.formula : undefined}>
                    {renderCell(column, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
