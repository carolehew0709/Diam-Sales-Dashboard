import { ApiError } from "./auth";
import type { ImportBatch } from "./types";
/** Parse all sheets for historical derivation first, then explicitly narrow replacement. */
export function selectImportWeeks<
  T extends Pick<
    ImportBatch,
    "snapshots" | "lines" | "customerAnalysis" | "receivables"
  >,
>(parsed: T, selection: unknown): T {
  if (selection === null || selection === undefined) return parsed;
  if (
    typeof selection !== "string" ||
    !/^\d{1,2}(,\d{1,2})*$/.test(selection) ||
    parsed.customerAnalysis ||
    parsed.receivables
  )
    throw new ApiError(
      400,
      "Week selection requires a sales workbook and explicit weeks 1–53",
    );
  const weeks = selection.split(",").map(Number);
  if (
    new Set(weeks).size !== weeks.length ||
    weeks.some(
      (w) => w < 1 || w > 53 || !parsed.snapshots.some((s) => s.week === w),
    )
  )
    throw new ApiError(
      400,
      "Selected sales weeks are invalid or missing from the source",
    );
  return {
    ...parsed,
    snapshots: parsed.snapshots.filter((s) => weeks.includes(s.week)),
    lines: parsed.lines.filter((l) => weeks.includes(l.week)),
  };
}
