import { randomUUID } from "node:crypto";
import { ApiError } from "./auth";
import { managementActor } from "./account-management";
import { ensureGovernance } from "./governance";
import { digest } from "./import-review";
import { getDashboardSnapshot, defaultFilters } from "./dashboard";
import { entities } from "./entities";
import type { BudgetVersion, CorrectionVersion, Store, User } from "./types";
export type GovernanceChange = {
  kind: "budget" | "correction";
  revokeId?: string;
  entityId: string;
  year: number;
  reason: string;
  total?: number | null;
  external?: number | null;
  group?: number | null;
  weeks?: number[];
  salesType?: string;
  metric?: string;
  value?: number;
};
export function validateGovernance(state: Store, input: GovernanceChange, actor: User) {
  if (!["budget", "correction"].includes(input.kind))
    throw new ApiError(400, "Invalid policy type");
  if (typeof input.reason !== "string" || input.reason.trim().length < 5)
    throw new ApiError(400, "Provide the approval evidence and explanation");
  if (input.revokeId) {
    const version = (
      input.kind === "budget" ? state.budgetVersions : state.correctionVersions
    )?.find((v) => v.id === input.revokeId && !v.revokedAt);
    if (!version) throw new ApiError(404, "Active policy version not found");
    return {
      ...input,
      entityId: version.entityId,
      year: version.year,
      ...("weeks" in version
        ? {
            weeks: version.weeks,
            salesType: version.salesType,
            metric: version.metric,
          }
        : {}),
    };
  }
  if (
    !entities.some((e) => e.id === input.entityId) ||
    !Number.isInteger(input.year) ||
    input.year < 2000 ||
    input.year > 2099
  )
    throw new ApiError(400, "Provide a valid Entity and fiscal year");
  if (input.kind === "budget") {
    if (
      typeof input.total !== "number" ||
      !Number.isFinite(input.total) ||
      input.total < 0
    )
      throw new ApiError(
        400,
        "Approved annual total must be a non-negative number",
      );
    const ext = input.external ?? null,
      group = input.group ?? null;
    if (
      (ext === null) !== (group === null) ||
      [ext, group].some(
        (v) =>
          v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0),
      ) ||
      (ext !== null &&
        group !== null &&
        Math.abs(ext + group - input.total) > 1e-6)
    )
      throw new ApiError(
        400,
        "Provide both sales-type splits matching the total, or leave both blank",
      );
  } else {
    if (
      !["sales", "orderbook", "prospect", "annual"].includes(
        input.metric ?? "",
      ) ||
      !["all", "external", "group"].includes(input.salesType ?? "") ||
      typeof input.value !== "number" ||
      !Number.isFinite(input.value) ||
      !Array.isArray(input.weeks) ||
      !input.weeks.length ||
      input.weeks.some((w) => !Number.isInteger(w) || w < 1 || w > 53) ||
      new Set(input.weeks).size !== input.weeks.length
    )
      throw new ApiError(
        400,
        "Specify correction metric, sales type, amount and exact weeks 1–53",
      );
    if (
      input.year === 2026 &&
      ["ddc", "dcp"].includes(input.entityId) &&
      input.salesType === "group"
    )
      throw new ApiError(
        400,
        "FY2026 internal Group reporting remains excluded",
      );
  }
  return input;
}
function apply(
  state: Store,
  input: GovernanceChange,
  actor: User,
  id: string,
  at: string,
) {
  if (input.revokeId) {
    const version = (
      input.kind === "budget"
        ? state.budgetVersions!
        : state.correctionVersions!
    ).find((v) => v.id === input.revokeId)!;
    version.revokedAt = at;
  } else if (input.kind === "budget")
    state.budgetVersions!.push({
      id,
      entityId: input.entityId,
      year: input.year,
      total: input.total!,
      external: input.external ?? null,
      group: input.group ?? null,
      reason: input.reason.trim(),
      actor: actor.id,
      at,
    });
  else
    state.correctionVersions!.push({
      id,
      entityId: input.entityId,
      year: input.year,
      weeks: input.weeks!,
      salesType: input.salesType as CorrectionVersion["salesType"],
      metric: input.metric as CorrectionVersion["metric"],
      value: input.value!,
      reason: input.reason.trim(),
      actor: actor.id,
      at,
    });
}
export function previewGovernance(
  state: Store,
  actor: User,
  input: GovernanceChange,
) {
  managementActor(state, actor);
  ensureGovernance(state);
  const change = validateGovernance(state, input, actor);
  const after = structuredClone(state);
  apply(after, change, actor, "preview", "preview");
  const metrics = (s: Store) =>
    getDashboardSnapshot(s, actor, {
      ...defaultFilters,
      region: "APAC",
      entity: change.entityId,
      year: change.year,
      salesType:
        change.kind === "correction"
          ? (change.salesType as CorrectionVersion["salesType"]) || "all"
          : "all",
    }).totals;
  const weeks = change.kind === "correction" ? (change.weeks ?? []) : [];
  const affectedWeeks = weeks.map((week) => {
    const scoped = (s: Store) => ({
      ...s,
      snapshots: s.snapshots.filter(
        (v) => v.entityId !== change.entityId || v.week === week,
      ),
    });
    return {
      week,
      before: metrics(scoped(state)),
      after: metrics(scoped(after)),
    };
  });
  return {
    change,
    before: metrics(state),
    after: metrics(after),
    affectedWeeks,
    reviewVersion: digest({
      change,
      snapshots: state.snapshots.filter(
        (s) =>
          s.entityId === change.entityId &&
          [change.year, change.year - 1].includes(s.year),
      ),
      budgets: state.budgetVersions,
      corrections: state.correctionVersions,
    }),
  };
}
export function commitGovernance(
  state: Store,
  actor: User,
  change: GovernanceChange,
  version: string,
) {
  const preview = previewGovernance(state, actor, change);
  if (preview.reviewVersion !== version)
    throw new ApiError(
      409,
      "Policy or source changed; refresh the impact preview",
    );
  const id = randomUUID(),
    at = new Date().toISOString();
  apply(state, preview.change, actor, id, at);
  state.revision++;
  state.dataUpdatedAt = at;
  state.audit.push({
    id,
    at,
    actor: actor.id,
    action: `${change.revokeId ? "revoke" : "approve"}-${change.kind}`,
    subject: `${change.revokeId ?? id}: ${change.reason.trim()}`,
  });
  return { ok: true, revision: state.revision };
}
