import type { Locale } from "./i18n";

export type ChartTooltipData = {
  title: string;
  subtitle?: string;
  rows: { label: string; value: string }[];
};

export function salesNumber(
  value: number | null,
  locale: Locale,
  digits = 0,
  style: "decimal" | "percent" = "decimal",
) {
  if (value === null) return "—";
  const formatter = new Intl.NumberFormat(locale, {
    style,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return formatter.format(
    Object.is(value, -0) ||
      Math.abs(value) * (style === "percent" ? 100 : 1) < 0.5 * 10 ** -digits
      ? 0
      : value,
  );
}

export function chartAmount(value: number | null, locale: Locale) {
  return value === null ? "—" : `${salesNumber(value, locale)} kEUR`;
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
