import type { Locale } from "./i18n";

export type ChartTooltipData = {
  title: string;
  subtitle?: string;
  rows: { label: string; value: string }[];
};

export function chartAmount(value: number | null, locale: Locale) {
  return value === null
    ? "—"
    : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kEUR`;
}

export function tooltipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const gap = 16,
    margin = 12;
  return {
    x: Math.max(
      margin,
      Math.min(
        x + gap + width > viewportWidth - margin ? x - width - gap : x + gap,
        viewportWidth - width - margin,
      ),
    ),
    y: Math.max(
      margin,
      Math.min(
        y + gap + height > viewportHeight - margin ? y - height - gap : y + gap,
        viewportHeight - height - margin,
      ),
    ),
  };
}
