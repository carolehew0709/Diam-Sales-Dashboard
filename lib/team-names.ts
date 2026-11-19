/** Preserve the split in explicit source names and the verified China legacy aliases. */
export function splitPannyTeam(source: string, reporting = source): string {
  const explicit = (name: string) =>
    /^panny(?:\s+team)?\s*[-–—]\s*([ls])$/i.exec(name.trim())?.[1];
  const suffix = explicit(source) ?? explicit(reporting);
  if (suffix) return `Panny Team-${suffix.toUpperCase()}`;

  // Respect a workbook that gives the legacy team a different explicit name.
  if (reporting === source || /^panny(?:\s+team)?$/i.test(reporting.trim())) {
    if (/^lvmh(?:\s*\+\s*exclusive)?\s+team$/i.test(source.trim()))
      return "Panny Team-L";
    if (/^sephora\s+team$/i.test(source.trim())) return "Panny Team-S";
  }
  return reporting;
}
