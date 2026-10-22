/** Raw chart values. Null means unavailable and must stay an empty Excel cell. */
export type ChartTable = {
  columns: { label: string; format?: string }[];
  rows: (string | number | null)[][];
  /** Zero-based data rows to emphasize as totals or key results. */
  summaryRows?: number[];
};
export type ChartWorkbookSheet = {
  name: string;
  title: string;
  context: string;
  note: string;
  table: ChartTable;
};
export type ChartWorkbookImage = ChartWorkbookSheet & {
  image: string;
  imageWidth: number;
  imageHeight: number;
};
