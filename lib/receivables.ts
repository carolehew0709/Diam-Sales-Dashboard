import { entities, matchesRegion } from "./entities";
import { canView } from "./permissions";
import { teamName } from "./sales-teams";
import { teamReportingName } from "./team-actuals";
import type { Store, User } from "./types";
import type {
  AgingBucket,
  ReceivableRecord,
  ReceivablesFilters,
} from "./receivables-types";
import { receivableCurrencies } from "./receivables-types";

/** Receipt balances are independent of invoices and never netted across currencies or categories. */
export function summarizeReceipts(records: ReceivableRecord[]) {
  return receivableCurrencies.flatMap((currency) => {
    const rows = records.filter(
      (r) => r.category !== "invoice" && r.currency === currency,
    );
    if (!rows.length) return [];
    const category = (kind: "unknown" | "advance" | "pending") => {
      const selected = rows.filter((r) => r.category === kind);
      return {
        count: selected.length,
        amount: selected.reduce((sum, r) => sum + r.amount, 0),
      };
    };
    return [
      {
        currency,
        unknown: category("unknown"),
        advance: category("advance"),
        pending: category("pending"),
        total: {
          count: rows.length,
          amount: rows.reduce((sum, r) => sum + r.amount, 0),
        },
      },
    ];
  });
}

export const agingBuckets: AgingBucket[] = [
  "not-due",
  "1-30",
  "31-60",
  "61-90",
  "91-120",
  "over-120",
  "unclassified",
];
export const defaultReceivablesFilters: ReceivablesFilters = {
  region: "China",
  bu: "all",
  salesTeam: "all",
  customerGroup: "all",
  customer: "all",
  salesType: "all",
  aging: "all",
};
export const hasReceivablesAccess = (user: User) =>
  entities.some((e) => ["dhk", "ddc"].includes(e.id) && canView(user, e));
export function receivablesFiltersFrom(url: URL): ReceivablesFilters {
  const p = url.searchParams;
  return {
    region: p.get("region") ?? "China",
    bu: p.get("bu") ?? "all",
    salesTeam: p.get("salesTeam") ?? "all",
    customer: p.get("customer") ?? "all",
    sourceCustomerGroup: p.get("sourceCustomerGroup") || undefined,
    customerGroup:
      p.get("customerGroup") === "top10"
        ? "top10"
        : p.get("customerGroup") === "other"
          ? "other"
          : "all",
    salesType:
      p.get("salesType") === "external"
        ? "external"
        : p.get("salesType") === "group"
          ? "group"
          : "all",
    aging: agingBuckets.includes(p.get("aging") as AgingBucket)
      ? (p.get("aging") as AgingBucket)
      : "all",
  };
}
const customerKey = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();
function arTeamName(value: string, state: Store) {
  const source = teamName(value);
  if (source === "预收" || source.toUpperCase() === "TBC") return "";
  const name = teamReportingName(
    source === "BD Team" ? "BD" : value,
    state.teamActualData,
  );
  if (/^panny team-[ls]$/i.test(name)) return "Panny Team";
  if (/^lynn-team$/i.test(name)) return "Lynn Team";
  return name;
}
export function getReceivables(
  state: Store,
  user: User,
  filters: ReceivablesFilters,
) {
  const allowed = entities.filter(
    (e) => ["dhk", "ddc"].includes(e.id) && canView(user, e),
  );
  const paymentsAllowed = ["dhk", "ddc"].every((id) =>
    allowed.some((e) => e.id === id),
  );
  // Shared China receipts have no BU allocation and require access to both source BUs.
  const permitted = (state.receivables ?? []).filter((r) =>
    r.category === "invoice"
      ? allowed.some((e) => e.id === r.entityId)
      : paymentsAllowed && r.entityId === "china-payments",
  );
  const classification = new Map<
    string,
    Set<ReceivableRecord["customerType"]>
  >();
  for (const r of permitted.filter((r) => r.category === "invoice")) {
    const key = customerKey(r.customer);
    classification.set(
      key,
      new Set([...(classification.get(key) ?? []), r.customerType]),
    );
  }
  const records = permitted.map((r) => {
    const types = classification.get(customerKey(r.customer));
    return {
      ...r,
      sourceSalesTeam: r.salesTeam,
      salesTeam: arTeamName(r.salesTeam, state),
      customerType:
        r.category !== "invoice" && types?.size === 1
          ? [...types][0]
          : r.customerType,
    };
  });
  const context = records.filter(
    (r) =>
      (filters.region === "China" || filters.region === "APAC") &&
      (filters.salesTeam === "all" ||
        teamName(r.salesTeam) === filters.salesTeam) &&
      (filters.salesType === "all" ||
        r.customerType.toLowerCase() === filters.salesType),
  );
  const scope = context.filter(
    (r) =>
      r.category !== "invoice" ||
      allowed.some(
        (e) =>
          e.id === r.entityId &&
          matchesRegion(e, filters.region) &&
          (filters.bu === "all" || e.code === filters.bu),
      ),
  );
  const invoices = scope.filter(
    (r) =>
      r.category === "invoice" &&
      (filters.aging === "all" || r.aging === filters.aging),
  );
  const sourceCustomerGroups = [
    ...new Set(
      records
        .filter(
          (r) =>
            r.category === "invoice" &&
            (filters.region === "China" || filters.region === "APAC") &&
            (filters.bu === "all" ||
              allowed.some(
                (e) => e.id === r.entityId && e.code === filters.bu,
              )),
        )
        .map((r) => r.customerGroup)
        .filter((value): value is string => !!value),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const groupedInvoices = filters.sourceCustomerGroup
    ? invoices.filter((r) => r.customerGroup === filters.sourceCustomerGroup)
    : invoices;
  // Rank independently within each source currency; never assume exchange rates.
  const grouped = new Map<
    string,
    { customer: string; currency: string; amount: number; overdue: number }
  >();
  for (const r of groupedInvoices) {
    const key = `${r.currency}:${r.customer}`;
    const item = grouped.get(key) ?? {
      customer: r.customer,
      currency: r.currency,
      amount: 0,
      overdue: 0,
    };
    item.amount += r.amount;
    if (!["not-due", "unclassified"].includes(r.aging))
      item.overdue += r.amount;
    grouped.set(key, item);
  }
  const ranked = [...grouped.values()].sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      b.amount - a.amount ||
      a.customer.localeCompare(b.customer),
  );
  const top = new Set(
    receivableCurrencies.flatMap((c) =>
      ranked
        .filter((r) => r.currency === c)
        .slice(0, 10)
        .map((r) => `${c}:${r.customer}`),
    ),
  );
  const paymentCohort = new Map<string, number>();
  for (const r of context.filter((r) => r.category === "invoice")) {
    const key = `${r.currency}:${r.customer}`;
    paymentCohort.set(key, (paymentCohort.get(key) ?? 0) + r.amount);
  }
  const paymentTop = new Set(
    receivableCurrencies.flatMap((currency) =>
      [...paymentCohort]
        .filter(([key]) => key.startsWith(currency + ":"))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([key]) => key),
    ),
  );
  const inCohort = (r: ReceivableRecord) =>
    filters.customerGroup === "all" ||
    (filters.customerGroup === "top10"
      ? (r.category === "invoice" ? top : paymentTop).has(
          `${r.currency}:${r.customer}`,
        )
      : !(r.category === "invoice" ? top : paymentTop).has(
          `${r.currency}:${r.customer}`,
        ));
  const customerMatch = (r: ReceivableRecord) =>
    inCohort(r) &&
    (filters.customer === "all" || r.customer === filters.customer);
  const rows = groupedInvoices.filter(customerMatch);
  // Aging applies to invoices only. BU never filters the shared receipt pool.
  const payments = scope.filter(
    (r) => r.category !== "invoice" && customerMatch(r),
  );
  const currencies = receivableCurrencies.filter(
    (currency) =>
      rows.some((r) => r.currency === currency) ||
      payments.some((r) => r.currency === currency),
  );
  const totals = currencies.map((currency) => {
    const subset = rows.filter((r) => r.currency === currency);
    const receipts = payments.filter((r) => r.currency === currency);
    const sum = (items: ReceivableRecord[]) =>
      items.reduce((n, r) => n + r.amount, 0);
    return {
      currency,
      ar: subset.length ? sum(subset) : null,
      due: subset.length
        ? sum(subset.filter((r) => r.aging === "not-due"))
        : null,
      overdue: subset.length
        ? sum(
            subset.filter(
              (r) => !["not-due", "unclassified"].includes(r.aging),
            ),
          )
        : null,
      unclassified: subset.length
        ? sum(subset.filter((r) => r.aging === "unclassified"))
        : null,
      unknown:
        paymentsAllowed &&
        permitted.some(
          (r) => r.category === "unknown" && r.currency === currency,
        )
          ? sum(receipts.filter((r) => r.category === "unknown"))
          : null,
      advance:
        paymentsAllowed &&
        permitted.some(
          (r) => r.category === "advance" && r.currency === currency,
        )
          ? sum(receipts.filter((r) => r.category === "advance"))
          : null,
      pending:
        paymentsAllowed &&
        permitted.some(
          (r) => r.category === "pending" && r.currency === currency,
        )
          ? sum(receipts.filter((r) => r.category === "pending"))
          : null,
    };
  });
  const chart = currencies
    .filter((currency) => rows.some((r) => r.currency === currency))
    .map((currency) => ({
      currency,
      buckets: agingBuckets.map((bucket) => ({
        bucket,
        amount: rows
          .filter((r) => r.currency === currency && r.aging === bucket)
          .reduce((n, r) => n + r.amount, 0),
      })),
    }));
  const invoiceSourceDates = allowed.flatMap((entity) => {
    const dates = [
      ...new Set(
        scope
          .filter((r) => r.category === "invoice" && r.entityId === entity.id)
          .map((r) => r.asOfDate)
          .filter((date): date is string => !!date),
      ),
    ].sort();
    return dates.length
      ? [{ entityId: entity.id, entityCode: entity.code, dates }]
      : [];
  });
  // A receipt date is not an invoice-aging cutoff. Keep the two meanings separate.
  const latestReceiptDate =
    payments
      .map((r) => r.receivedDate)
      .filter((date): date is string => !!date)
      .sort()
      .at(-1) ?? null;
  return {
    filters,
    entities: allowed,
    paymentsAllowed,
    totals,
    chart,
    rows,
    payments,
    receiptSummary: summarizeReceipts(payments),
    invoiceSourceDates,
    latestReceiptDate,
    customers: [
      ...new Set(
        [
          ...groupedInvoices,
          ...scope.filter(
            (r) => !filters.sourceCustomerGroup && r.category !== "invoice",
          ),
        ]
          .filter(inCohort)
          .map((r) => r.customer),
      ),
    ].sort(),
    sourceCustomerGroups,
    salesTeams: [...new Set(records.map((r) => teamName(r.salesTeam)))].sort(),
    ranking: ranked.filter((r) =>
      rows.some(
        (row) => row.customer === r.customer && row.currency === r.currency,
      ),
    ),
    asOfDates: [
      ...new Set(
        scope
          .filter((r) => r.category === "invoice")
          .map((r) => r.asOfDate)
          .filter((d): d is string => !!d),
      ),
    ].sort(),
    sourceFiles: [...new Set(permitted.map((r) => r.sourceFile))],
    latestDataUpdate: state.receivablesUpdatedAt ?? null,
    unclassifiedPayments: records.filter(
      (r) => r.category !== "invoice" && r.customerType === "Unclassified",
    ).length,
  };
}
export type ReceivablesView = ReturnType<typeof getReceivables>;
