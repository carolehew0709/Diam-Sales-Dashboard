import type {
  OpsValueCurrency,
  OpsOrderLine,
  SalesOperationsSnapshot,
} from "./sales-operations-types";
import { teamReportingName } from "./team-actuals";
import type { Store } from "./types";
import {
  isDehkOrder,
  projectOperationsAmounts,
} from "./sales-operations-pricing";

const sumKnown = (amounts: (number | null)[]) =>
  amounts.some((amount) => amount !== null)
    ? amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0)
    : null;

export function opsWeek(date: string) {
  const day = new Date(date + "T00:00:00Z");
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export function opsWeekNumber(week: string) {
  const thursday = new Date(week + "T00:00:00Z");
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const january = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - january) / 604800000) + 1;
}

function weekRange(week: string, from: string, asOf: string) {
  const end = new Date(week + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  const sunday = end.toISOString().slice(0, 10);
  return {
    weekFrom: week < from ? from : week,
    weekTo: sunday > asOf ? asOf : sunday,
    partial: week < from || sunday > asOf,
  };
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

type ValuedLine = ReturnType<typeof projectOperationsAmounts>["lines"][number];

function orderTotals(lines: ValuedLine[]) {
  return {
    lineCount: lines.length,
    orders: new Set(lines.map(({ order }) => order)).size,
    ordered: sumKnown(lines.map(({ ordered }) => ordered)),
    shipped: sumKnown(lines.map(({ shipped }) => shipped)),
    open: sumKnown(lines.map(({ open }) => open)),
    openLines: lines.filter(({ openQuantity }) => openQuantity > 0).length,
    missingOrderAmounts: lines.filter(({ ordered }) => ordered === null).length,
  };
}

type TeamMappings = Store["teamActualData"];
const ddcTeam = (line: Pick<OpsOrderLine, "team">, mappings: TeamMappings) =>
  teamReportingName(line.team ?? undefined, mappings) || null;

export function salesOperationsView(
  snapshot: SalesOperationsSnapshot,
  mappings?: TeamMappings,
  useOriginalPrices = false,
) {
  const { payments, receivables, receivableLinks, from, asOf, sources } =
    snapshot;
  const { lines, shipments, coverage } = projectOperationsAmounts(
    snapshot,
    useOriginalPrices,
  );
  const linksByOrder = group(receivableLinks, ({ order }) => order);
  const linksByReceivable = group(receivableLinks, ({ document }) => document);
  const orderCurrencyKey = ({
    order,
    currency,
  }: {
    order: string;
    currency: OpsValueCurrency;
  }) => JSON.stringify([order, currency]);
  const shipmentsByOrder = group(shipments, orderCurrencyKey);
  const shipmentsByDocument = group(shipments, ({ document, currency }) =>
    JSON.stringify([document, currency]),
  );
  const linkedOrderIds = (rows: { order: string }[]) => [
    ...new Set(rows.map(({ order }) => order)),
  ];
  const linesByOrder = group(lines, ({ order }) => order);
  const customers = (orders: string[]) => [
    ...new Set(
      orders
        .map((order) => linesByOrder.get(order)?.[0].customer ?? "")
        .filter(Boolean),
    ),
  ];
  const receivableRegister = receivables.map((row) => {
    const orders = linkedOrderIds(linksByReceivable.get(row.document) ?? []);
    return { ...row, orders, customers: customers(orders) };
  });
  const receivablesById = new Map(
    receivableRegister.map((row) => [row.document, row]),
  );
  const paymentRegister = payments.map((row) => {
    const document = receivablesById.get(row.receivable);
    return {
      ...row,
      orders: document?.orders ?? [],
      customers: document?.customers ?? [],
    };
  });
  const shipmentRegister = [...shipmentsByDocument.values()].map((rows) => {
    const { document, date, currency } = rows[0];
    const orders = linkedOrderIds(rows);
    return {
      document,
      date,
      currency,
      orders,
      customers: customers(orders),
      amount: sumKnown(rows.map(({ amount }) => amount)),
    };
  });
  const paymentsByReceivable = group(payments, ({ receivable }) => receivable);
  const byWeek = group(lines, ({ date, currency }) =>
    JSON.stringify([opsWeek(date), currency]),
  );
  const shippedByWeek = group(shipments, ({ date, currency }) =>
    JSON.stringify([opsWeek(date), currency]),
  );
  const weekly = [...new Set([...byWeek.keys(), ...shippedByWeek.keys()])]
    .sort()
    .map((id) => {
      const [week, currency] = JSON.parse(id) as [string, OpsValueCurrency];
      const orderRows = byWeek.get(id) ?? [];
      const shipmentRows = shippedByWeek.get(id) ?? [];
      return {
        week,
        ...weekRange(week, from, asOf),
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
        JSON.stringify([
          dimension === "team" ? ddcTeam(line, mappings) : line.customer,
          line.currency,
        ]),
      ),
    ]
      .map(([id, rows]) => {
        const [name, currency] = JSON.parse(id) as [
          string | null,
          OpsValueCurrency,
        ];
        return { name, currency, ...orderTotals(rows) };
      })
      .sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          (b.ordered ?? -Infinity) - (a.ordered ?? -Infinity),
      );
  const orders = [...group(lines, orderCurrencyKey)]
    .map(([orderScope, rows]) => {
      const row = rows[0];
      const { order } = row;
      const documents = [
        ...new Set(
          (linksByOrder.get(order) ?? []).map(({ document }) => document),
        ),
      ];
      const invoiceNumbers = new Set(
        documents.flatMap(
          (document) => receivablesById.get(document)?.invoices ?? [],
        ),
      );
      const receipts = new Set(
        documents.flatMap((document) =>
          (paymentsByReceivable.get(document) ?? []).map(
            ({ receipt }) => receipt,
          ),
        ),
      );
      return {
        order,
        date: row.date,
        customer: row.customer,
        currency: row.currency,
        ...orderTotals(rows),
        teams: [...group(rows, (line) => ddcTeam(line, mappings) ?? "")].map(
          ([name, teamRows]) => ({
            name: name || null,
            ...orderTotals(teamRows),
          }),
        ),
        shipmentWeeks: [
          ...group(shipmentsByOrder.get(orderScope) ?? [], ({ date }) =>
            opsWeek(date),
          ),
        ].map(([week, batches]) => ({
          week,
          shipped: sumKnown(batches.map(({ amount }) => amount)),
        })),
        receivableCount: documents.length,
        invoiceCount: invoiceNumbers.size,
        receiptCount: receipts.size,
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
        currency: currency as OpsValueCurrency,
        ...orderTotals(rows),
        matchedCash: sumKnown(allocations.map(({ received }) => received)),
        receiptCount: new Set(allocations.map(({ receipt }) => receipt)).size,
        paymentReceivables: new Set(
          allocations.map(({ receivable }) => receivable),
        ).size,
        groupOrders: new Set(
          rows
            .filter(({ customer }) => isDehkOrder({ customer }))
            .map(({ order }) => order),
        ).size,
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    from,
    asOf,
    version: coverage
      ? snapshot.originalPricing!.id
      : (snapshot.publication?.id ?? asOf),
    coverage,
    sources: coverage ? [...sources, ...coverage.sources] : sources,
    receiptTotals: [...group(payments, ({ currency }) => currency)].map(
      ([currency, rows]) => ({
        currency: currency as "CNY" | "EUR",
        matchedCash: sumKnown(rows.map(({ received }) => received)),
      }),
    ),
    weekly,
    orders,
    currencies,
    customers: breakdown("customer"),
    teams: breakdown("team"),
    orderCount: linesByOrder.size,
    splitTeamOrders: [...linesByOrder.values()].filter(
      (rows) => new Set(rows.map((line) => ddcTeam(line, mappings))).size > 1,
    ).length,
    shipmentRegister,
    receivableRegister,
    paymentRegister,
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
  mappings?: TeamMappings,
  useOriginalPrices = false,
) {
  const { lines, shipments, coverage } = projectOperationsAmounts(
    {
      ...snapshot,
      lines: snapshot.lines.filter((line) => line.order === order),
      shipments: snapshot.shipments.filter(
        (shipment) => shipment.order === order,
      ),
    },
    useOriginalPrices,
  );
  if (!lines.length) return null;
  const links = snapshot.receivableLinks.filter((link) => link.order === order);
  const selected = new Set(links.map(({ document }) => document));
  return {
    order,
    date: lines[0].date,
    customer: lines[0].customer,
    currency: lines[0].currency,
    currencies: [...new Set(lines.map((line) => line.currency))],
    useOriginalPrices: coverage !== null,
    lines: lines.map((line) => ({
      ...line,
      reportingTeam: ddcTeam(line, mappings),
    })),
    links,
    shipments,
    receivables: snapshot.receivables
      .filter(({ document }) => selected.has(document))
      .map((row) => ({
        ...row,
        linkedOrderCount: new Set(
          snapshot.receivableLinks
            .filter(({ document }) => document === row.document)
            .map(({ order }) => order),
        ).size,
      })),
    payments: snapshot.payments.filter(({ receivable }) =>
      selected.has(receivable),
    ),
  };
}

export type SalesOperationsView = ReturnType<typeof salesOperationsView>;
export type OpsOrderSummary = SalesOperationsView["orders"][number];
export type OpsOrderSelection = { currency: OpsValueCurrency } & (
  | { dimension: "byWeek"; week: string }
  | { dimension: "byCustomer" | "byTeam"; name: string | null }
);

export function opsSelectedOrders(
  rows: OpsOrderSummary[],
  selection?: OpsOrderSelection,
) {
  if (!selection) return rows;
  return rows.flatMap((row) => {
    if (row.currency !== selection.currency) return [];
    if (selection.dimension === "byCustomer")
      return row.customer === selection.name ? [row] : [];
    if (selection.dimension === "byTeam") {
      const team = row.teams.find(({ name }) => name === selection.name);
      return team ? [{ ...row, ...team, teams: [team] }] : [];
    }
    if (selection.dimension === "byWeek") {
      const placed = opsWeek(row.date) === selection.week;
      const shipped = row.shipmentWeeks.find(
        ({ week }) => week === selection.week,
      );
      return placed || shipped
        ? [
            {
              ...row,
              ordered: placed ? row.ordered : null,
              open: placed ? row.open : null,
              shipped: shipped?.shipped ?? null,
            },
          ]
        : [];
    }
    return [];
  });
}
export type SalesOperationsOrder = NonNullable<
  ReturnType<typeof salesOperationsOrder>
>;
