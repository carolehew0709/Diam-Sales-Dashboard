import type { ChartWorkbookSheet } from "./chart-workbook-types";

// Only mounted charts from an authenticated dashboard register here; no source seed.
const charts = new WeakMap<SVGSVGElement, ChartWorkbookSheet>();
export function registerWorkbookChart(
  svg: SVGSVGElement,
  sheet: ChartWorkbookSheet,
) {
  charts.set(svg, sheet);
  svg.setAttribute("data-chart-workbook", "true");
  return () => {
    charts.delete(svg);
    svg.removeAttribute("data-chart-workbook");
  };
}
export function collectWorkbookCharts(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<SVGSVGElement>("svg[data-chart-workbook]"),
  ).flatMap((svg) => {
    const sheet = charts.get(svg);
    return sheet ? [{ svg, sheet }] : [];
  });
}
