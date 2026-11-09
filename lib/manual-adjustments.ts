import { randomUUID, createHash } from "node:crypto";
import { ApiError } from "./auth";
import { entities } from "./entities";
import { canEdit } from "./permissions";
import { validateGovernance } from "./governance-management";
import { agingBuckets } from "./receivables";
import type {
  ImportBatch,
  Store,
  User,
  BudgetVersion,
  CorrectionVersion,
} from "./types";
import type { ReceivableRecord } from "./receivables-types";

export function policyScopes(value: BudgetVersion | CorrectionVersion) {
  return "weeks" in value
    ? value.weeks.map(
        (w) =>
          `policy:correction:${value.entityId}:${value.year}:${w}:${value.salesType}:${value.metric}`,
      )
    : [`policy:budget:${value.entityId}:${value.year}`];
}
export function adjustmentPolicy(
  batch: ImportBatch,
): BudgetVersion | CorrectionVersion {
  const a = batch.adjustment!;
  const common = {
    id: batch.id,
    entityId: a.entityId,
    year: a.year,
    reason: a.reason,
    actor: batch.submittedBy,
    at: batch.submittedAt,
  };
  return a.kind === "budget"
    ? {
        ...common,
        total: a.total!,
        external: a.external ?? null,
        group: a.group ?? null,
      }
    : {
        ...common,
        weeks: a.weeks!,
        metric: a.metric as CorrectionVersion["metric"],
        salesType: a.salesType as CorrectionVersion["salesType"],
        value: a.value!,
      };
}
export function createAdjustment(
  state: Store,
  user: User,
  input: unknown,
): ImportBatch {
  if (!input || typeof input !== "object")
    throw new ApiError(400, "Invalid adjustment");
  const raw = input as Record<string, unknown>;
  if (
    !["superadmin", "region_admin", "editor"].includes(user.role) ||
    user.disabled ||
    user.systemIdentity
  )
    throw new ApiError(403, "Adjustment access required");
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (reason.length < 5)
    throw new ApiError(
      400,
      "Provide an adjustment reason (at least 5 characters)",
    );
  const common = {
    id: randomUUID(),
    sourceType: "Manual" as const,
    status: "review" as const,
    submittedBy: user.id,
    submittedAt: new Date().toISOString(),
    snapshots: [],
    lines: [],
    sheets: [],
    findings: [{ severity: "review" as const, message: reason }],
    templateVersion: "manual-adjustment-v1",
  };
  if (raw.kind === "ar") {
    const record = (state.receivables ?? []).find((r) => r.id === raw.recordId);
    if (!record) throw new ApiError(404, "Receivable record not found");
    const entityIds =
      record.entityId === "china-payments" ? ["dhk", "ddc"] : [record.entityId];
    if (
      entityIds.some(
        (id) => !entities.some((e) => e.id === id && canEdit(user, e)),
      )
    )
      throw new ApiError(403, "Adjustment outside your edit scope");
    if (!raw.patch || typeof raw.patch !== "object" || Array.isArray(raw.patch))
      throw new ApiError(400, "Provide fields to adjust");
    const patch = raw.patch as Record<string, unknown>,
      updated = { ...record };
    const allowed =
      record.category === "invoice"
        ? [
            "amount",
            "invoiceDate",
            "dueDate",
            "asOfDate",
            "aging",
            "customer",
            "salesTeam",
            "pic",
          ]
        : ["amount", "receivedDate", "customer", "salesTeam", "pic"];
    if (
      !Object.keys(patch).length ||
      Object.keys(patch).some((k) => !allowed.includes(k))
    )
      throw new ApiError(400, "Unsupported adjustment fields");
    for (const [key, value] of Object.entries(patch)) {
      if (key === "amount") {
        if (typeof value !== "number" || !Number.isFinite(value))
          throw new ApiError(400, "Amount must be a finite number");
      } else if (key === "aging") {
        if (!agingBuckets.includes(value as never))
          throw new ApiError(400, "Invalid aging bucket");
      } else if (key.endsWith("Date")) {
        if (
          value !== null &&
          (typeof value !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString().slice(0, 10) !== value)
        )
          throw new ApiError(400, "Use a valid date YYYY-MM-DD");
      } else if (
        typeof value !== "string" ||
        value.length > 500 ||
        (key === "customer" && !value.trim())
      )
        throw new ApiError(400, "Invalid text field");
      Object.assign(updated, {
        [key]: typeof value === "string" ? value.trim() : value,
      });
    }
    if ("asOfDate" in patch || "dueDate" in patch) {
      const days =
        updated.asOfDate && updated.dueDate
          ? Math.round(
              (Date.parse(updated.asOfDate) - Date.parse(updated.dueDate)) /
                86400000,
            )
          : null;
      updated.overdueDays = days;
      if (!("aging" in patch))
        updated.aging =
          days === null
            ? "unclassified"
            : days <= 0
              ? "not-due"
              : days <= 30
                ? "1-30"
                : days <= 60
                  ? "31-60"
                  : days <= 90
                    ? "61-90"
                    : days <= 120
                      ? "91-120"
                      : "over-120";
    }
    // Original workbook location and non-edited fields remain intact in both versions.
    return {
      ...common,
      fileName: `Manual AR · ${record.invoiceNumber || record.customer}`,
      entityIds,
      adjustedRecordId: record.id,
      adjustmentBase: createHash("sha256")
        .update(JSON.stringify(record))
        .digest("hex"),
      receivables: [updated],
      receivablesKind: record.category === "invoice" ? "aging" : "payments",
    };
  }
  if (!["budget", "correction"].includes(String(raw.kind)))
    throw new ApiError(400, "Invalid adjustment type");
  const inputChange = raw as unknown as NonNullable<ImportBatch["adjustment"]>;
  if ((raw as Record<string, unknown>).revokeId)
    throw new ApiError(
      400,
      "Submit a new adjustment instead of revoking another record",
    );
  if (!entities.some((e) => e.id === inputChange.entityId && canEdit(user, e)))
    throw new ApiError(403, "Adjustment outside your edit scope");
  const change = validateGovernance(state, inputChange, user);
  if (
    change.kind === "correction" &&
    !change.weeks!.every((week) =>
      state.snapshots.some(
        (s) =>
          s.entityId === change.entityId &&
          [change.year, change.year - 1].includes(s.year) &&
          s.week === week,
      ),
    )
  )
    throw new ApiError(
      400,
      "No published source exists for the selected year/week",
    );
  return {
    ...common,
    adjustment: { ...change, reason },
    entityIds: [change.entityId],
    fileName: `Manual ${change.kind} · ${change.entityId.toUpperCase()} · ${change.year}`,
  };
}

export function adjustmentScopeMatches(
  scope: string,
  record: ReceivableRecord,
) {
  return (
    scope === `ar-row:${record.id}` ||
    (scope === `ar:aging:${record.entityId}` &&
      record.category === "invoice") ||
    scope === `ar:${record.category === "invoice" ? "aging" : "payments"}`
  );
}
