import type { WorkSheet } from "xlsx";
import { utils } from "xlsx";
/** Monthly actual columns can be inserted between the left team/brand dimensions and order details. */
export function orderDimensionColumns(
  sheet: WorkSheet,
  headerRow: number,
  anchorCol: number,
) {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  for (const row of [headerRow, headerRow + 1])
    for (let c = 2; c < anchorCol; c++) {
      const label = String(sheet[utils.encode_cell({ r: row, c })]?.v ?? "")
        .trim()
        .toLowerCase();
      if (label !== "jan") continue;
      let length = 0;
      while (
        c + length < anchorCol &&
        length < 12 &&
        String(sheet[utils.encode_cell({ r: row, c: c + length })]?.v ?? "")
          .trim()
          .toLowerCase() === months[length]
      )
        length++;
      if (length >= 2) return { team: c - 2, product: c - 1, shifted: true };
    }
  return { team: anchorCol, product: anchorCol + 1, shifted: false };
}
