import type { Amount } from "./types";

export const keyCustomers = ["Sephora", "Estee Lauder", "Loreal", "LVMH", "Coty", "Fenty"] as const;

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function keyCustomerName(value: string) {
  const plain = normalize(value.split(/[（(]/)[0]);
  return keyCustomers.find((name) => normalize(name) === plain || (name === "LVMH" && /^lvmh\s*-/i.test(value)));
}

/** Only explicit customer names/annotated variants; never infer a brand's parent. */
export function keyCustomerOrderbook(rows: readonly { customer: string; value: number }[]) {
  return keyCustomers.map((name) => {
    const matched = rows.filter((row) => keyCustomerName(row.customer) === name);
    return {
      name,
      value: matched.length ? matched.reduce((sum, row) => sum + row.value, 0) : null as Amount,
      sources: matched.map((row) => row.customer),
    };
  });
}
