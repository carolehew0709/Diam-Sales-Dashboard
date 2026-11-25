import type {
  OpsOrderLine,
  OpsOriginalPrice,
  OpsShipment,
  OpsValueCurrency,
  SalesOperationsSnapshot,
} from "./sales-operations-types";

type ValuedLine = Omit<OpsOrderLine, "currency"> & {
  currency: OpsValueCurrency;
  originalPrice?: OpsOriginalPrice;
};
type ValuedShipment = Omit<OpsShipment, "currency"> & {
  currency: OpsValueCurrency;
};

export const isDehkOrder = (line: Pick<OpsOrderLine, "customer">) =>
  /^DE\s*HK(?:\s+LIMITED)?$/i.test(line.customer.trim());
export const opsLineKey = (row: { order: string; line: number }) =>
  JSON.stringify([row.order, row.line]);

export function projectOperationsAmounts(
  snapshot: SalesOperationsSnapshot,
  useOriginalPrices: boolean,
) {
  const pricing = useOriginalPrices ? snapshot.originalPricing : undefined;
  if (!pricing)
    return {
      lines: snapshot.lines as ValuedLine[],
      shipments: snapshot.shipments as ValuedShipment[],
      coverage: null,
    };

  const prices = new Map(pricing.prices.map((row) => [opsLineKey(row), row]));
  const basis = new Map<string, OpsOriginalPrice | null>();
  for (const line of snapshot.lines) {
    if (isDehkOrder(line))
      basis.set(opsLineKey(line), prices.get(opsLineKey(line)) ?? null);
  }
  const shippedAmounts = new Map<string, number>();
  const shipments: ValuedShipment[] = snapshot.shipments.map((shipment) => {
    const key = opsLineKey(shipment);
    const price = basis.get(key);
    if (price === undefined) return shipment;
    if (!price) return { ...shipment, currency: "PENDING", amount: null };
    const amount = shipment.quantity * price.grossUnitPrice;
    shippedAmounts.set(key, (shippedAmounts.get(key) ?? 0) + amount);
    return { ...shipment, currency: price.currency, amount };
  });
  const lines: ValuedLine[] = snapshot.lines.map((line) => {
    const key = opsLineKey(line);
    const price = basis.get(key);
    if (price === undefined) return line;
    if (!price)
      return {
        ...line,
        currency: "PENDING",
        ordered: null,
        shipped: null,
        open: null,
      };
    return {
      ...line,
      currency: price.currency,
      ordered: line.quantity * price.grossUnitPrice,
      shipped: shippedAmounts.get(key) ?? (line.shipped === 0 ? 0 : null),
      open: line.openQuantity * price.grossUnitPrice,
      originalPrice: price,
    };
  });
  return {
    lines,
    shipments,
    coverage: {
      confirmed: lines.filter((line) => line.originalPrice).length,
      pending: lines.filter((line) => line.currency === "PENDING").length,
      sources: pricing.sources,
    },
  };
}
