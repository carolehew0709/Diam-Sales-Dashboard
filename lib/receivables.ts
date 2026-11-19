import { entities, matchesRegion } from "./entities";
import { canView, canAccessModule } from "./permissions";
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

export type PaymentBalanceRow = Pick<
  ReceivableRecord,
  "customer" | "currency" | "amount" | "receivedDate"
> & { category: "unknown" | "advance" };

export function paymentBalances(
  records: PaymentBalanceRow[],
  customer: string,
  category: PaymentBalanceRow["category"] | "",
) {
  const selected = records.filter(
    (row) =>
      (!customer || row.customer === customer) &&
      (!category || row.category === category),
  );
  return {
    count: selected.length,
    latestDate: selected.reduce<string | null>(
      (latest, row) =>
        row.receivedDate && (!latest || latest < row.receivedDate)
          ? row.receivedDate
          : latest,
      null,
    ),
    balances: receivableCurrencies.flatMap((currency) => {
      const rows = selected.filter((row) => row.currency === currency);
      if (!rows.length) return [];
      const unknown = rows.filter((row) => row.category === "unknown");
      const advance = rows.filter((row) => row.category === "advance");
      const sum = (items: PaymentBalanceRow[]) =>
        items.length
          ? items.reduce((amount, row) => amount + row.amount, 0)
          : null;
      return [
        {
          currency,
          unknown: sum(unknown),
          advance: sum(advance),
          total: sum(rows),
        },
      ];
    }),
  };
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
const rankingLimit = 10;
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
  canAccessModule(user, "ar-aging") &&
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
/** Reporting-only exclusion. Preserve original invoices in storage and import history. */
export function isExcludedDdcInvoice(record: ReceivableRecord) {
  return (
    record.category === "invoice" &&
    record.entityId === "ddc" &&
    [record.customer, record.sourceCustomer].some(
      (name) => !!name && ["dehk", "dehk limited"].includes(customerKey(name)),
    )
  );
}
const isOverdue = (bucket: AgingBucket) =>
  bucket !== "not-due" && bucket !== "unclassified";
const shareOf = (value: number, total: number) =>
  total > 0 ? value / total : null;
export function rankCustomerGroups(rows: ReceivableRecord[]) {
  const groups = new Map<
    string,
    {
      customerGroup: string;
      currency: ReceivableRecord["currency"];
      amount: number;
      overdue: number;
    }
  >();
  for (const row of rows) {
    if (!row.customerGroup || isExcludedDdcInvoice(row)) continue;
    const key = `${row.currency}:${row.customerGroup}`;
    const item = groups.get(key) ?? {
      customerGroup: row.customerGroup,
      currency: row.currency,
      amount: 0,
      overdue: 0,
    };
    item.amount += row.amount;
    if (isOverdue(row.aging)) item.overdue += row.amount;
    groups.set(key, item);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      b.amount - a.amount ||
      a.customerGroup.localeCompare(b.customerGroup),
  );
}
function summarizeRanking(rows: ReceivableRecord[]) {
  const ranked = rankCustomerGroups(rows);
  return receivableCurrencies.flatMap((currency) => {
    const groups = ranked.filter((row) => row.currency === currency);
    const top = groups.slice(0, rankingLimit);
    const remaining = groups.slice(rankingLimit);
    const visible = remaining.length
      ? [
          ...top,
          {
            customerGroup: null,
            currency,
            amount: remaining.reduce((total, row) => total + row.amount, 0),
            overdue: remaining.reduce((total, row) => total + row.overdue, 0),
          },
        ]
      : top;
    return visible.map((row) => ({
      ...row,
      overdueProportion: shareOf(row.overdue, row.amount),
    }));
  });
}
function arTeamName(value: string, state: Store) {
  const source = teamName(value);
  if (source === "预收" || source.toUpperCase() === "TBC") return "";
  const name = teamReportingName(
    source === "BD Team" ? "BD" : value,
    state.teamActualData,
  );
  if (/^lynn-team$/i.test(name)) return "Lynn Team";
  return name;
}
export function getReceivables(
  state: Store,
  user: User,
  filters: ReceivablesFilters,
) {
  const allowed = entities.filter(
    (e) =>
      canAccessModule(user, "ar-aging") &&
      ["dhk", "ddc"].includes(e.id) &&
      canView(user, e),
  );
  const paymentsAllowed = ["dhk", "ddc"].every((id) =>
    allowed.some((e) => e.id === id),
  );
  // Shared China receipts have no BU allocation and require access to both source BUs.
  const authorizedSources = (state.receivables ?? []).filter((r) =>
    r.category === "invoice"
      ? allowed.some((e) => e.id === r.entityId)
      : paymentsAllowed && r.entityId === "china-payments",
  );
  const classification = new Map<
    string,
    Set<ReceivableRecord["customerType"]>
  >();
  // Receipt classification still uses original evidence, independent of invoice reporting exclusions.
  for (const r of authorizedSources.filter((r) => r.category === "invoice")) {
    const key = customerKey(r.sourceCustomer ?? r.customer);
    classification.set(
      key,
      new Set([...(classification.get(key) ?? []), r.customerType]),
    );
  }
  const permitted = authorizedSources.filter((r) => !isExcludedDdcInvoice(r));
  const records = permitted.map((r) => {
    const types = classification.get(customerKey(r.customer));
    return {
      ...r,
      sourceSalesTeam: r.salesTeam,
      salesTeam: arTeamName(r.salesTeam, state),
      customerType:
        r.category === "invoice" && r.entityId === "ddc"
          ? ("External" as const)
          : r.category !== "invoice" && types?.size === 1
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
  // Customer and Customer Group filters narrow the report without changing the cohorts.
  const ranked =
    filters.customerGroup === "all" ? [] : rankCustomerGroups(invoices);
  const top = new Set(
    receivableCurrencies.flatMap((c) =>
      ranked
        .filter((r) => r.currency === c)
        .slice(0, rankingLimit)
        .map((r) => `${c}:${r.customerGroup}`),
    ),
  );
  const inCohort = (r: ReceivableRecord) =>
    r.category !== "invoice" ||
    filters.customerGroup === "all" ||
    (!!r.customerGroup &&
      !isExcludedDdcInvoice(r) &&
      top.has(`${r.currency}:${r.customerGroup}`) ===
        (filters.customerGroup === "top10"));
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
        ? sum(subset.filter((r) => isOverdue(r.aging)))
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
  const chart = totals.flatMap(({ currency, ar, overdue }) => {
    if (ar === null) return [];
    // Net balances include credit notes. An empty, zero or negative base has no share.
    return [
      {
        currency,
        overdueProportion: overdue === null ? null : shareOf(overdue, ar),
        buckets: agingBuckets.map((bucket) => {
          const amount = rows
            .filter((r) => r.currency === currency && r.aging === bucket)
            .reduce((n, r) => n + r.amount, 0);
          return { bucket, amount, proportion: shareOf(amount, ar) };
        }),
      },
    ];
  });
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
  // Keep the separate payment section independent of the invoice filters and
  // expose only the fields it uses, within the existing shared-receipt scope.
  const paymentFilterRows = permitted.flatMap<PaymentBalanceRow>(
    ({ category, customer, amount, currency, receivedDate }) =>
      category === "invoice"
        ? []
        : [
            {
              category: category === "advance" ? "advance" : "unknown",
              customer,
              amount,
              currency,
              receivedDate,
            },
          ],
  );
  return {
    filters,
    entities: allowed,
    paymentsAllowed,
    totals,
    chart,
    rows,
    payments,
    paymentFilterRows,
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
    rankingExcludedCurrencies: [
      ...new Set(rows.filter(isExcludedDdcInvoice).map((r) => r.currency)),
    ],
    ranking: summarizeRanking(rows),
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
