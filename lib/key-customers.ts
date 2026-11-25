export const keyCustomers = [
  "Sephora",
  "Estee Lauder",
  "Loreal",
  "LVMH",
  "Coty",
  "Fenty",
] as const;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function keyCustomerName(value: string) {
  const plain = normalize(value.split(/[（(]/)[0]);
  return keyCustomers.find(
    (name) =>
      normalize(name) === plain ||
      (name === "LVMH" && /^lvmh\s*-/i.test(value)),
  );
}

/** Rank named bill-to customers, combining only explicit aliases and spelling variants. */
export function rankedCustomerProspect(
  rows: readonly { customer: string; value: number }[],
) {
  const totals = new Map<
    string,
    { name: string; value: number; sources: Set<string> }
  >();
  for (const row of rows) {
    const source = row.customer.replace(/\s+/g, " ").trim();
    if (!source || source.toLowerCase() === "unspecified customer") continue;
    const name = keyCustomerName(source) ?? source;
    const key = name.normalize("NFKC").toLowerCase();
    const total = totals.get(key) ?? {
      name,
      value: 0,
      sources: new Set<string>(),
    };
    total.value += row.value;
    total.sources.add(source);
    totals.set(key, total);
  }
  return [...totals.values()].sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name, "en"),
  );
}
