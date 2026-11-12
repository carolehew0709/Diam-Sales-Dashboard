import { retainTeamSource, publishTeamReference } from "./team-reporting";
import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "./auth";
import { entities } from "./entities";
import { canEdit, canPublish } from "./permissions";
import { policyState } from "./governance";
import { reportingState } from "./intercompany";
import { receivableCurrencies } from "./receivables-types";
import { entityMetric, defaultFilters } from "./dashboard";
import {
  adjustmentPolicy,
  policyScopes,
  adjustmentScopeMatches,
} from "./manual-adjustments";
import type {
  ImportBatch,
  Store,
  User,
  PublicationSlice,
  Snapshot,
  OrderBookLine,
  MonthlySalesClose,
} from "./types";

export const snapshotScope = (
  s: Pick<Snapshot, "entityId" | "year" | "week">,
) => `sales:${s.entityId}:${s.year}:${s.week}`;
const monthlySalesScope = (close: MonthlySalesClose) =>
  `monthly-sales:${close.entityId}:${close.year}`;
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function content(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(content);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) => !["publishedAt", "sourceFile", "sourceNote"].includes(k),
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, content(v)]),
    );
  return value;
}
export function batchScopes(batch: ImportBatch) {
  if (batch.adjustment) return policyScopes(adjustmentPolicy(batch));
  if (batch.adjustedRecordId) return [`ar-row:${batch.adjustedRecordId}`];
  if (batch.teamActualData) return ["team-actual:current"];
  if (batch.monthlySalesCloses) return batch.monthlySalesCloses.map(monthlySalesScope);
  if (batch.customerAnalysis)
    return [`customer:${batch.customerAnalysis.month}`];
  if (batch.receivablesKind)
    return batch.receivablesEntityIds
      ? batch.receivablesEntityIds.map(
          (id) => `ar:${batch.receivablesKind}:${id}`,
        )
      : [`ar:${batch.receivablesKind}`];
  return [...new Set(batch.snapshots.map(snapshotScope))];
}
export function slice(
  state: Pick<
    Store,
    | "snapshots"
    | "lines"
    | "customerAnalyses"
    | "receivables"
    | "teamActualData"
    | "monthlySalesCloses"
    | "budgetVersions"
    | "correctionVersions"
  >,
  scopes: string[],
): PublicationSlice {
  return {
    ...(scopes.some((scope) => scope.startsWith("monthly-sales:"))
      ? {
          monthlySalesCloses: (state.monthlySalesCloses ?? []).filter((close) =>
            scopes.includes(monthlySalesScope(close)),
          ),
        }
      : {}),
    ...(scopes.some((k) => k.startsWith("policy:budget:"))
      ? {
          budgetVersions: (state.budgetVersions ?? []).filter((v) =>
            policyScopes(v).some((k) => scopes.includes(k)),
          ),
        }
      : {}),
    ...(scopes.some((k) => k.startsWith("policy:correction:"))
      ? {
          correctionVersions: (state.correctionVersions ?? []).filter((v) =>
            policyScopes(v).some((k) => scopes.includes(k)),
          ),
        }
      : {}),
    ...(scopes.includes("team-actual:current")
      ? { teamActualData: state.teamActualData }
      : {}),
    snapshots: state.snapshots.filter((s) => scopes.includes(snapshotScope(s))),
    lines: state.lines.filter((s) => scopes.includes(snapshotScope(s))),
    customerAnalyses: (state.customerAnalyses ?? []).filter((a) =>
      scopes.includes(`customer:${a.month}`),
    ),
    receivables: (state.receivables ?? []).filter((r) =>
      scopes.some((k) => adjustmentScopeMatches(k, r)),
    ),
  };
}
function sourceSlice(batch: ImportBatch, scopes: string[], state?: Store) {
  const policy = batch.adjustment ? adjustmentPolicy(batch) : undefined;
  return slice(
    {
      ...batch,
      budgetVersions:
        policy && !("weeks" in policy)
          ? [...(state?.budgetVersions ?? []), policy]
          : [],
      correctionVersions:
        policy && "weeks" in policy
          ? [...(state?.correctionVersions ?? []), policy]
          : [],
      customerAnalyses: batch.customerAnalysis ? [batch.customerAnalysis] : [],
    },
    scopes,
  );
}
export function replaceSlice(
  state: Store,
  scopes: string[],
  data: PublicationSlice,
) {
  if (data.budgetVersions)
    state.budgetVersions = (state.budgetVersions ?? [])
      .filter((v) => !policyScopes(v).some((k) => scopes.includes(k)))
      .concat(data.budgetVersions);
  if (data.correctionVersions)
    state.correctionVersions = (state.correctionVersions ?? [])
      .filter((v) => !policyScopes(v).some((k) => scopes.includes(k)))
      .concat(data.correctionVersions);
  if (scopes.includes("team-actual:current"))
    state.teamActualData = data.teamActualData;
  if (data.monthlySalesCloses)
    state.monthlySalesCloses = (state.monthlySalesCloses ?? [])
      .filter((close) => !scopes.includes(monthlySalesScope(close)))
      .concat(data.monthlySalesCloses);
  state.snapshots = state.snapshots
    .filter((s) => !scopes.includes(snapshotScope(s)))
    .concat(data.snapshots);
  state.lines = state.lines
    .filter((s) => !scopes.includes(snapshotScope(s)))
    .concat(data.lines);
  state.customerAnalyses = (state.customerAnalyses ?? [])
    .filter((a) => !scopes.includes(`customer:${a.month}`))
    .concat(data.customerAnalyses);
  state.receivables = (state.receivables ?? [])
    .filter((r) => !scopes.some((k) => adjustmentScopeMatches(k, r)))
    .concat(data.receivables);
}
export function importActor(
  state: Store,
  actor: User,
  batch: ImportBatch,
  publish = false,
) {
  const live = state.users.find((u) => u.id === actor.id);
  if (
    !live ||
    live.disabled ||
    live.systemIdentity ||
    live.role !== actor.role ||
    (live.sessionVersion ?? 1) !== (actor.sessionVersion ?? 1) ||
    !batch.entityIds.length ||
    batch.entityIds.some(
      (id) =>
        !entities.some(
          (e) =>
            e.id === id && (publish ? canPublish(live, e) : canEdit(live, e)),
        ),
    )
  )
    throw new ApiError(403, "Import is not permitted for this scope");
}
function totals(data: PublicationSlice) {
  const sum = (values: (number | null | undefined)[]) =>
    values.length && values.every((v) => typeof v === "number")
      ? values.reduce<number>((a, b) => a + (b ?? 0), 0)
      : null;
  const sales = sum(
    data.monthlySalesCloses?.flatMap((close) => close.monthly) ??
      data.snapshots.flatMap((s) => [s.turnover.external, s.turnover.group]),
  );
  const prospect = sum(
    data.snapshots.flatMap((s) => [s.orderbook.external, s.orderbook.group]),
  );
  return {
    sales,
    prospect,
    annual: sales === null || prospect === null ? null : sales + prospect,
    monthly: sum(
      data.snapshots.flatMap((s) => [
        ...s.monthlySales.external,
        ...s.monthlySales.group,
        ...s.monthlyOrderbook.external,
        ...s.monthlyOrderbook.group,
      ]),
    ),
    snapshots: data.snapshots.length,
    lines: data.lines.length,
    teams: new Set(data.lines.map((l) => l.salesTeam).filter(Boolean)).size,
    customers: new Set(data.lines.map((l) => l.customer).filter(Boolean)).size,
    arRecords: data.receivables.length,
    customerMonths: data.customerAnalyses.length,
    teamRows: data.teamActualData?.rows.length ?? 0,
    teamSales: data.teamActualData
      ? sum(data.teamActualData.rows.map((r) => r.ytd))
      : null,
    teamBudget: data.teamActualData
      ? sum(data.teamActualData.rows.map((r) => r.budget ?? 0))
      : null,
    arEUR: sum(
      data.receivables.filter((r) => r.currency === "EUR").map((r) => r.amount),
    ),
    arRMB: sum(
      data.receivables.filter((r) => r.currency === "RMB").map((r) => r.amount),
    ),
    arUSD: sum(
      data.receivables.filter((r) => r.currency === "USD").map((r) => r.amount),
    ),
    pendingReceipts: data.receivables.filter((r) => r.category === "pending")
      .length,
    customerCurrent: sum(
      data.customerAnalyses.flatMap((a) => a.breakdown.map((g) => g.values[3])),
    ),
  };
}
function reportingTotals(
  state: Store,
  data: PublicationSlice,
  batch?: ImportBatch,
) {
  if (batch?.adjustment) {
    const a = batch.adjustment;
    const virtual = structuredClone(state);
    replaceSlice(virtual, policyScopes(adjustmentPolicy(batch)), data);
    return (["all", "external", "group"] as const).map((salesType) => {
      const s = virtual.snapshots
        .filter(
          (s) =>
            s.entityId === a.entityId &&
            [a.year, a.year - 1].includes(s.year) &&
            (!a.weeks || a.weeks.includes(s.week)),
        )
        .sort((x, y) => y.year - x.year || y.week - x.week)[0];
      const projected = reportingState(
        policyState({ ...virtual, snapshots: s ? [s] : [] }, salesType),
        salesType,
      ).snapshots[0];
      const m = entityMetric(projected, {
        ...defaultFilters,
        year: a.year,
        salesType,
      });
      return {
        year: a.year,
        salesType,
        sales: m.sales,
        prospect: m.orderbook,
        additionalP1: m.prospect,
        annual: m.base,
        budget: m.budget,
        coverage: m.coverage,
        gap: m.gap,
        monthly: null,
        evidence: projected?.sourceCells ?? {},
      };
    });
  }
  const sample = data.snapshots[0];
  if (!sample) return [];
  return (["all", "external", "group"] as const).flatMap((salesType) => {
    const scoped = reportingState(
      policyState({ ...state, ...data }, salesType),
      salesType,
    );
    return [sample.year, sample.year + 1].map((year) => {
      const m = entityMetric(scoped.snapshots[0], {
        ...defaultFilters,
        year,
        salesType,
      });
      return {
        year,
        salesType,
        sales: m.sales,
        prospect: m.orderbook,
        additionalP1: m.prospect,
        annual: m.base,
        budget: m.budget,
        coverage: m.coverage,
        gap: m.gap,
        monthly: m.monthly.every((v) => v.base !== null)
          ? m.monthly.reduce((a, v) => a + v.base!, 0)
          : null,
        evidence: scoped.snapshots[0].sourceCells,
      };
    });
  });
}
export function previewImport(
  state: Store,
  batch: ImportBatch,
  selected?: string[],
) {
  if (
    batch.adjustedRecordId &&
    digest(
      (state.receivables ?? []).find((r) => r.id === batch.adjustedRecordId),
    ) !== batch.adjustmentBase
  )
    throw new ApiError(
      409,
      "This receivable changed after the adjustment was prepared. Submit a new adjustment against the current record.",
    );
  const options = batchScopes(batch).map((scope) => {
    const before = slice(state, [scope]);
    const after = sourceSlice(batch, [scope], state);
    const teamBefore = teamReferenceSlice(state, [scope]);
    const teamChanged =
      !!batch.updateTeamReporting &&
      scope.startsWith("sales:") &&
      (!teamBefore?.reviewedScopes?.includes(scope.slice(6)) ||
        digest(
          content({ snapshots: teamBefore.snapshots, lines: teamBefore.lines }),
        ) !==
          digest(content({ snapshots: after.snapshots, lines: after.lines })));
    const changed =
      digest(content(before)) !== digest(content(after)) || teamChanged;
    const sample = after.snapshots[0];
    const latest = sample
      ? Math.max(
          0,
          ...state.snapshots
            .filter(
              (s) => s.entityId === sample.entityId && s.year === sample.year,
            )
            .map((s) => s.week),
        )
      : 0;
    return {
      scope,
      changed,
      historical: !!sample && latest > sample.week,
      selected: changed && (!sample || !latest || sample.week >= latest),
      before: totals(before),
      after: totals(after),
      reportingBefore: reportingTotals(state, before, batch),
      reportingAfter: reportingTotals(state, after, batch),
      raw: sample ?? null,
      recordChanges: batch.adjustedRecordId
        ? Object.entries(after.receivables[0] ?? {})
            .filter(
              ([key, value]) =>
                JSON.stringify(
                  before.receivables[0]?.[
                    key as keyof (typeof before.receivables)[number]
                  ],
                ) !== JSON.stringify(value),
            )
            .map(([field, value]) => ({
              field,
              before:
                before.receivables[0]?.[
                  field as keyof (typeof before.receivables)[number]
                ] ?? null,
              after: value,
            }))
        : [],
    };
  });
  const scopes =
    selected ?? options.filter((o) => o.selected).map((o) => o.scope);
  if (
    !Array.isArray(scopes) ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((s) => !options.some((o) => o.scope === s))
  )
    throw new ApiError(400, "Invalid import selection");
  const changedScopes = scopes.filter(
    (s) => options.find((o) => o.scope === s)?.changed,
  );
  const findings = [...batch.findings];
  for (const o of options.filter((o) => changedScopes.includes(o.scope))) {
    if (o.scope.startsWith("monthly-sales:")) {
      const before = slice(state, [o.scope]).monthlySalesCloses?.[0];
      const after = sourceSlice(batch, [o.scope]).monthlySalesCloses?.[0];
      if (before && after && after.monthly.length < before.monthly.length)
        findings.push({
          severity: "error",
          message: `${o.scope}: the source ends before the latest published month`,
        });
    }
    if (
      o.before.sales !== null &&
      o.after.sales !== null &&
      o.after.sales < o.before.sales
    )
      findings.push({
        severity: "review",
        message: `${o.scope}: Sales decreased; confirm the source and impact`,
      });
  }
  const reviewVersion = digest({
    batch: digest(batch),
    scopes: changedScopes,
    before: slice(state, changedScopes),
    budgets: state.budgetVersions,
    corrections: state.correctionVersions,
    teamReference: batch.updateTeamReporting
      ? teamReferenceSlice(state, changedScopes)
      : undefined,
  });
  return {
    options,
    updateTeamReporting: !!batch.updateTeamReporting,
    selectedScopes: changedScopes,
    reviewVersion,
    findings,
    affected: batch.monthlySalesCloses
      ? ["Monthly / cumulative charts", "Sales exports"]
      : batch.teamActualData
      ? [
          "Team actual Sales / Annual Budget",
          "Sales Team2 names",
          "Team exports",
        ]
      : batch.receivablesKind
        ? ["AR report", "AR export"]
        : batch.customerAnalysis
          ? ["Key Customer Dashboard", "Customer export"]
          : [
              "Sales KPIs",
              "Monthly / cumulative charts",
              "Teams / customers",
              "Sales exports",
            ],
    unit: batch.receivablesKind
      ? `${receivableCurrencies.filter((currency) => batch.receivables?.some((r) => r.currency === currency)).join(" / ")} (separate currencies)`
      : "kEUR",
  };
}
export function publishReviewed(
  state: Store,
  batch: ImportBatch,
  actor: User,
  request: {
    selectedScopes?: string[];
    reviewVersion?: string;
    reason?: string;
  },
) {
  importActor(state, actor, batch, true);
  if (batch.adjustment && actor.role !== "superadmin")
    throw new ApiError(
      403,
      "Only Super Admin approves budget and sales corrections",
    );
  if (batch.status === "published") return batch;
  if (batch.status !== "review")
    throw new ApiError(409, "This batch is no longer in review");
  const preview = previewImport(state, batch, request.selectedScopes);
  if (!request.reviewVersion || request.reviewVersion !== preview.reviewVersion)
    throw new ApiError(
      409,
      "Review has changed. Refresh the difference preview before publishing.",
    );
  if (!preview.selectedScopes.length)
    throw new ApiError(409, "No changed ranges selected");
  if (preview.findings.some((f) => f.severity === "error"))
    throw new ApiError(409, "Resolve validation errors before publishing.");
  const reason = request.reason?.trim() ?? "";
  if (
    preview.findings.some((f) => f.severity === "review") &&
    reason.length < 5
  )
    throw new ApiError(
      400,
      "Explain your confirmation of the listed review findings",
    );
  const before = structuredClone(slice(state, preview.selectedScopes));
  const after = structuredClone(
    sourceSlice(batch, preview.selectedScopes, state),
  );
  const now = new Date().toISOString();
  after.snapshots.forEach((s) => {
    s.publishedAt = now;
  });
  if (batch.snapshots.length) retainTeamSource(state, now);
  const teamBefore = batch.updateTeamReporting
    ? teamReferenceSlice(state, preview.selectedScopes)
    : undefined;
  replaceSlice(state, preview.selectedScopes, after);
  publishTeamReference(
    state,
    { ...batch, snapshots: after.snapshots, lines: after.lines },
    now,
  );
  batch.publication = {
    before,
    after: structuredClone(after),
    scopes: preview.selectedScopes,
    reason,
    reviewVersion: preview.reviewVersion,
    ...(batch.updateTeamReporting
      ? {
          teamReference: {
            before: teamBefore,
            after: teamReferenceSlice(state, preview.selectedScopes),
          },
        }
      : {}),
  };
  batch.selectedScopes = preview.selectedScopes;
  batch.status = "published";
  batch.publishedAt = now;
  batch.publishedBy = actor.id;
  batch.revision = ++state.revision;
  if (batch.snapshots.length || batch.monthlySalesCloses) state.dataUpdatedAt = now;
  if (batch.receivablesKind) state.receivablesUpdatedAt = now;
  state.audit.push({
    id: randomUUID(),
    at: now,
    actor: actor.id,
    action: "publish",
    subject: batch.id,
  });
  return batch;
}
export function previewRestore(state: Store, batch: ImportBatch) {
  const p = batch.publication;
  if (!p || batch.status !== "published" || p.restoredAt)
    throw new ApiError(409, "This batch has no restorable publication version");
  if (
    state.batches.some(
      (b) =>
        b.id !== batch.id &&
        b.status === "published" &&
        (b.revision ?? 0) > (batch.revision ?? 0) &&
        (b.publication?.scopes ?? batchScopes(b)).some((k) =>
          p.scopes.some((scope) => restorationScopesOverlap(state, scope, k)),
        ),
    )
  )
    throw new ApiError(
      409,
      "A later publication overlaps this range. Restore that publication first.",
    );
  const current = slice(state, p.scopes);
  if (
    p.teamReference &&
    digest(teamReferenceSlice(state, p.scopes)) !==
      digest(p.teamReference.after)
  )
    throw new ApiError(
      409,
      "Team reference changed; restore the later team publication first",
    );
  if (digest(content(current)) !== digest(content(p.after)))
    throw new ApiError(
      409,
      "Published ranges changed; direct restore is unavailable",
    );
  return {
    scopes: p.scopes,
    ranges: p.scopes.map((scope) => ({
      scope,
      before: totals(slice(current, [scope])),
      after: totals(slice(p.before, [scope])),
    })),
    reviewVersion: digest({
      current,
      publication: p,
      budgets: state.budgetVersions,
      corrections: state.correctionVersions,
      teamReference: p.teamReference
        ? teamReferenceSlice(state, p.scopes)
        : undefined,
    }),
  };
}

/** Full AR replacements overlap only records in their own kind and Entity range. */
function restorationScopesOverlap(state: Store, a: string, b: string) {
  if (a === b) return true;
  const range = (scope: string) => {
    if (scope.startsWith("ar:")) {
      const [, kind, entityId] = scope.split(":");
      return { kind, entityId };
    }
    if (!scope.startsWith("ar-row:")) return null;
    const id = scope.slice("ar-row:".length);
    const record =
      state.receivables?.find((r) => r.id === id) ??
      state.batches
        .flatMap((batch) => [
          ...(batch.publication?.after.receivables ?? []),
          ...(batch.publication?.before.receivables ?? []),
          ...(batch.receivables ?? []),
        ])
        .find((r) => r.id === id);
    return record
      ? {
          kind: record.category === "invoice" ? "aging" : "payments",
          entityId: record.entityId,
        }
      : { kind: undefined, entityId: undefined };
  };
  const left = range(a),
    right = range(b);
  if (!left || !right) return false;
  if (a.startsWith("ar-row:") && b.startsWith("ar-row:")) return false;
  return (
    (!left.kind || !right.kind || left.kind === right.kind) &&
    (!left.entityId || !right.entityId || left.entityId === right.entityId)
  );
}
export function restoreReviewed(
  state: Store,
  batch: ImportBatch,
  actor: User,
  version: string,
  reason: string,
) {
  importActor(state, actor, batch, true);
  if (actor.role !== "superadmin")
    throw new ApiError(403, "Superadmin access required");
  const preview = previewRestore(state, batch);
  if (version !== preview.reviewVersion)
    throw new ApiError(409, "Refresh restore preview");
  if (typeof reason !== "string" || reason.trim().length < 5)
    throw new ApiError(400, "Provide a restore explanation");
  replaceSlice(
    state,
    preview.scopes,
    structuredClone(batch.publication!.before),
  );
  if (batch.publication!.teamReference)
    restoreTeamReference(
      state,
      preview.scopes,
      batch.publication!.teamReference.before,
    );
  const now = new Date().toISOString();
  batch.publication!.restoredAt = now;
  batch.publication!.restoredBy = actor.id;
  batch.status = "restored";
  state.revision++;
  if (batch.snapshots.length || batch.monthlySalesCloses) state.dataUpdatedAt = now;
  if (batch.receivablesKind) state.receivablesUpdatedAt = now;
  state.audit.push({
    id: randomUUID(),
    at: now,
    actor: actor.id,
    action: "restore-publication",
    subject: `${batch.id}: ${reason.trim()}`,
  });
  return batch;
}

function teamReferenceSlice(
  state: Store,
  scopes: string[],
): Store["retainedTeamSource"] {
  const r = state.retainedTeamSource;
  if (!r) return undefined;
  return {
    retainedAt: r.retainedAt,
    snapshots: r.snapshots.filter((s) => scopes.includes(snapshotScope(s))),
    lines: r.lines.filter((l) => scopes.includes(snapshotScope(l))),
    reviewedScopes: (r.reviewedScopes ?? []).filter((k) =>
      scopes.includes("sales:" + k),
    ),
  };
}
function restoreTeamReference(
  state: Store,
  scopes: string[],
  before: Store["retainedTeamSource"],
) {
  const r = state.retainedTeamSource;
  if (!r) return;
  r.snapshots = r.snapshots
    .filter((s) => !scopes.includes(snapshotScope(s)))
    .concat(before?.snapshots ?? []);
  r.lines = r.lines
    .filter((l) => !scopes.includes(snapshotScope(l)))
    .concat(before?.lines ?? []);
  r.reviewedScopes = (r.reviewedScopes ?? [])
    .filter((k) => !scopes.includes("sales:" + k))
    .concat(before?.reviewedScopes ?? []);
}
