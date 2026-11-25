import type {
  OpsCurrency,
  OpsOrderLine,
  SalesOperationsSnapshot,
} from "./sales-operations-types";

const sumKnown = (amounts: (number | null)[]) =>
  amounts.some((amount) => amount !== null)
    ? amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0)
    : null;

export function opsWeek(date: string) {
  const day = new Date(date + "T00:00:00Z");
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function group<T>(rows: T[], identify: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = identify(row);
    const existing = groups.get(id);
    if (existing) existing.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

function orderTotals(lines: OpsOrderLine[]) {
  return {
    lineCount: lines.length,
    orders: new Set(lines.map(({ order }) => order)).size,
    ordered: sumKnown(lines.map(({ ordered }) => ordered)),
    shipped: sumKnown(lines.map(({ shipped }) => shipped)),
    open: sumKnown(lines.map(({ open }) => open)),
    openLines: lines.filter(({ openQuantity }) => openQuantity > 0).length,
  };
}

export function salesOperationsView(snapshot: SalesOperationsSnapshot) {
  const { lines, shipments, payments, receivables, from, asOf, sources } =
    snapshot;
  const byWeek = group(lines, ({ date, currency }) =>
    JSON.stringify([opsWeek(date), currency]),
  );
  const shippedByWeek = group(shipments, ({ date, currency }) =>
    JSON.stringify([opsWeek(date), currency]),
  );
  const weekly = [...new Set([...byWeek.keys(), ...shippedByWeek.keys()])]
    .sort()
    .map((id) => {
      const [week, currency] = JSON.parse(id) as [string, OpsCurrency];
      const orderRows = byWeek.get(id) ?? [];
      const shipmentRows = shippedByWeek.get(id) ?? [];
      return {
        week,
        currency,
        orders: new Set(orderRows.map(({ order }) => order)).size,
        ordered: sumKnown(orderRows.map(({ ordered }) => ordered)),
        shipmentDocuments: new Set(shipmentRows.map(({ document }) => document))
          .size,
        shipped: sumKnown(shipmentRows.map(({ amount }) => amount)),
        open: sumKnown(orderRows.map(({ open }) => open)),
      };
    });
  const breakdown = (dimension: "customer" | "team") =>
    [
      ...group(lines, (line) =>
        JSON.stringify([line[dimension], line.currency]),
      ),
    ]
      .map(([id, rows]) => {
        const [name, currency] = JSON.parse(id) as [string | null, OpsCurrency];
        return { name, currency, ...orderTotals(rows) };
      })
      .sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          (b.ordered ?? -Infinity) - (a.ordered ?? -Infinity),
      );
  const orders = [...group(lines, ({ order }) => order)]
    .map(([order, rows]) => {
      const row = rows[0];
      return {
        order,
        date: row.date,
        customer: row.customer,
        currency: row.currency,
        ...orderTotals(rows),
      };
    })
    .sort(
      (a, b) => b.date.localeCompare(a.date) || a.order.localeCompare(b.order),
    );
  const currencies = [...group(lines, ({ currency }) => currency)]
    .map(([currency, rows]) => {
      const allocations = payments.filter(
        (payment) => payment.currency === currency,
      );
      return {
        currency: currency as OpsCurrency,
        ...orderTotals(rows),
        matchedCash: sumKnown(allocations.map(({ received }) => received)),
        receiptCount: new Set(allocations.map(({ receipt }) => receipt)).size,
        paymentReceivables: new Set(
          allocations.map(({ receivable }) => receivable),
        ).size,
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    from,
    asOf,
    sources,
    weekly,
    orders,
    currencies,
    customers: breakdown("customer"),
    teams: breakdown("team"),
    shipmentCount: new Set(shipments.map(({ document }) => document)).size,
    receivableCount: receivables.length,
    invoiceCount: new Set(receivables.flatMap(({ invoices }) => invoices)).size,
    receiptCount: new Set(payments.map(({ receipt }) => receipt)).size,
    paymentReceivables: new Set(payments.map(({ receivable }) => receivable))
      .size,
    missingOrderAmounts: lines.filter(({ ordered }) => ordered === null).length,
    assignedLines: lines.filter(({ team }) => team !== null).length,
  };
}

export function salesOperationsOrder(
  snapshot: SalesOperationsSnapshot,
  order: string,
) {
  const lines = snapshot.lines.filter((line) => line.order === order);
  if (!lines.length) return null;
  const links = snapshot.receivableLinks.filter((link) => link.order === order);
  const selected = new Set(links.map(({ document }) => document));
  return {
    order,
    date: lines[0].date,
    customer: lines[0].customer,
    currency: lines[0].currency,
    lines,
    links,
    shipments: snapshot.shipments.filter(
      (shipment) => shipment.order === order,
    ),
    receivables: snapshot.receivables.filter(({ document }) =>
      selected.has(document),
    ),
    payments: snapshot.payments.filter(({ receivable }) =>
      selected.has(receivable),
    ),
  };
}

export type SalesOperationsView = ReturnType<typeof salesOperationsView>;
export type SalesOperationsOrder = NonNullable<
  ReturnType<typeof salesOperationsOrder>
>;
