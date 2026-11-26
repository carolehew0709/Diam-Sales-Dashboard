import { isDehkOrder, opsLineKey } from "./sales-operations-pricing";
import type { SalesOperationsSnapshot } from "./sales-operations-types";
import { teamReportingName } from "./team-actuals";
import type { Store } from "./types";
import type {
  OperationsEntity,
  OperationsStage,
  OperationsWorkflowRecord,
  OperationsWorkflowSources,
} from "./sales-operations-workflow-types";

type StageSource = {
  entity: OperationsEntity;
  file: string;
  sheet: string;
  from: string;
  asOf: string;
};
type StageView = {
  records: OperationsWorkflowRecord[];
  sources: StageSource[];
  expected: OperationsEntity[];
};

export function operationsWorkflowView(
  sources: OperationsWorkflowSources,
  execution: SalesOperationsSnapshot | undefined,
  entities: OperationsEntity[],
  mappings?: Store["teamActualData"],
) {
  const scoped = sources.orders.filter((source) =>
    entities.includes(source.entity),
  );
  const window =
    (entities.includes("DDC") ? execution : undefined) ?? scoped[0];
  if (!window) return null;
  const { from, asOf } = window;
  const inPeriod = ({ date }: Pick<OperationsWorkflowRecord, "date">) =>
    date >= from && date <= asOf;
  const documentStage = (
    kind: keyof OperationsWorkflowSources,
    filter: (row: OperationsWorkflowRecord) => boolean,
  ): StageView => {
    const covering = sources[kind].filter(
      (source) =>
        !source.supplemental &&
        entities.includes(source.entity) &&
        source.from <= from &&
        source.asOf >= asOf,
    );
    const available =
      kind === "receipts"
        ? [
            ...covering,
            ...sources.receipts.filter(
              (source) =>
                source.supplemental &&
                covering.some(({ entity }) => entity === source.entity) &&
                source.from <= asOf &&
                source.asOf >= from,
            ),
          ]
        : covering;
    const receiptDocuments = new Set<string>();
    const records = available.flatMap((source) =>
      source.records.filter((row) => {
        if (!inPeriod(row) || row.date < source.from || row.date > source.asOf)
          return false;
        if (kind === "receipts") {
          const key = JSON.stringify([row.entity, row.document]);
          if (receiptDocuments.has(key)) return false;
          receiptDocuments.add(key);
        }
        return filter(row);
      }),
    );
    return {
      expected: entities,
      sources: available.map(({ entity, file, sheet, from, asOf }) => ({
        entity,
        file,
        sheet,
        from,
        asOf,
      })),
      records: records.map((row) => ({
        ...row,
        team: teamReportingName(row.team ?? undefined, mappings) || null,
      })),
    };
  };
  const orders = documentStage(
    "orders",
    (row) => row.entity === "DEHK" || !isDehkOrder(row),
  );
  const receipts = documentStage(
    "receipts",
    (row) => row.division === "external" && !isDehkOrder(row),
  );
  const invoices = documentStage(
    "invoices",
    (row) => row.entity === "DEHK" || !isDehkOrder(row),
  );
  const shipments: StageView = {
    records: [],
    sources: [],
    expected: entities.includes("DDC") ? ["DDC"] : [],
  };
  if (execution && entities.includes("DDC")) {
    const byOrderLine = new Map(
      execution.lines.map((row) => [opsLineKey(row), row]),
    );
    const pricing = entities.includes("DEHK")
      ? execution.originalPricing
      : undefined;
    const byPrice = new Map(
      pricing?.prices.map((row) => [opsLineKey(row), row]),
    );
    shipments.sources = [
      ...execution.sources
        .slice(0, 2)
        .map((source) => ({ ...source, entity: "DDC" as const, from, asOf })),
      ...(pricing?.sources ?? []).map((source) => ({
        file: source.file,
        sheet: source.sheet,
        entity: "DEHK" as const,
        from,
        asOf,
      })),
    ];
    for (const row of execution.shipments) {
      const key = opsLineKey(row);
      const order = byOrderLine.get(key);
      if (!order || !inPeriod(row)) continue;
      const price = isDehkOrder(order) ? byPrice.get(key) : undefined;
      shipments.records.push({
        entity: "DDC",
        document: row.document,
        date: row.date,
        customer: order.customer,
        order: order.order,
        team: teamReportingName(order.team ?? undefined, mappings) || null,
        quantity: row.quantity,
        item: order.item,
        sourceRow: row.sourceRow,
        currency: price?.currency ?? null,
        amount: price ? row.quantity * price.grossUnitPrice : null,
        originalOrder: price?.originalOrder,
      });
    }
  }
  return {
    from,
    asOf,
    entities,
    stages: { orders, shipments, invoices, receipts },
  };
}

export type OperationsWorkflowView = NonNullable<
  ReturnType<typeof operationsWorkflowView>
>;

export function filterOperationsWorkflow(
  workflow: OperationsWorkflowView,
  entity: OperationsEntity | "",
): OperationsWorkflowView {
  if (!entity || !workflow.entities.includes(entity)) return workflow;
  const forEntity = (stage: OperationsStage): StageView => {
    const source = workflow.stages[stage];
    const expected = source.expected.filter((code) => code === entity);
    return {
      expected,
      records: source.records.filter((row) => row.entity === entity),
      // DEHK reference orders remain evidence for priced DDC shipments.
      sources: source.sources.filter(
        (row) =>
          expected.length > 0 &&
          (stage === "shipments" || row.entity === entity),
      ),
    };
  };
  return {
    ...workflow,
    entities: [entity],
    stages: {
      orders: forEntity("orders"),
      shipments: forEntity("shipments"),
      invoices: forEntity("invoices"),
      receipts: forEntity("receipts"),
    },
  };
}

export function operationsStageTotals(rows: OperationsWorkflowRecord[]) {
  const amounts = new Map<
    NonNullable<OperationsWorkflowRecord["currency"]>,
    number
  >();
  const documents = new Set<string>();
  let missing = 0;
  for (const row of rows) {
    documents.add(JSON.stringify([row.entity, row.document]));
    if (row.amount === null || row.currency === null) missing++;
    else
      amounts.set(row.currency, (amounts.get(row.currency) ?? 0) + row.amount);
  }
  return {
    documents: documents.size,
    missing,
    amounts: [...amounts].sort(([a], [b]) => a.localeCompare(b)),
  };
}
