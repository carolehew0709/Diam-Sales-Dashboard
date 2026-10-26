import type { Amount } from "./types";

export const keyCustomers = ["Sephora", "Estee Lauder", "Loreal", "LVMH", "Coty", "Fenty"] as const;

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Only explicit customer names/annotated variants; never infer a brand's parent. */
export function keyCustomerOrderbook(rows: readonly { customer: string; value: number }[]) {
  return keyCustomers.map((name) => {
    const id = normalize(name);
    const matched = rows.filter((row) => {
      const plain = normalize(row.customer.split(/[（(]/)[0]);
      return plain === id || (id === "lvmh" && /^lvmh\s*-/i.test(row.customer));
    });
    return {
      name,
      value: matched.length ? matched.reduce((sum, row) => sum + row.value, 0) : null as Amount,
      sources: matched.map((row) => row.customer),
    };
  });
}
