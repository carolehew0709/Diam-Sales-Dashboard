/** Integer, data-driven nice ticks. Does not round the underlying data. */
export function integerAxis(
  values: readonly (number | null | undefined)[],
  target = 5,
) {
  const finite = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const low = Math.min(0, ...finite),
    high = Math.max(0, ...finite);
  const raw = Math.max(1, (high - low) / Math.max(1, target - 1));
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    ([1, 2, 5, 10].find((n) => n * power >= raw) ?? 10) * power,
  );
  const min = Math.floor(low / step) * step;
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  const ticks = Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, i) => min + i * step,
  );
  return { min, max, step, ticks };
}
