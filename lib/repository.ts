import {
  previewImport,
  publishReviewed,
  previewRestore,
  restoreReviewed,
  importActor,
  snapshotScope,
} from "./import-review";
import { randomUUID } from "node:crypto";
import { storage, storageStatus } from "./storage";
import { entities } from "./entities";
import { canEdit, canPublish } from "./permissions";
import { ApiError } from "./auth";
import type { ImportBatch, User } from "./types";
import customerSeed from "@/data/customer-analysis.json";
import type { CustomerAnalysis } from "./graphics-types";
import { createAdjustment } from "./manual-adjustments";
const customerAnalyses = customerSeed.analyses as CustomerAnalysis[];
export const repository = {
  createAdjustmentBatch: async (input: unknown, user: User) =>
    storage.transaction((state) => {
      const batch = createAdjustment(state, user, input);
      importActor(state, user, batch);
      state.batches.unshift(batch);
      state.audit.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        actor: user.id,
        action: "submit-adjustment",
        subject: batch.id,
      });
      return batch;
    }),
  read: async () => {
    const state = await storage.read();
    return {
      ...state,
      customerAnalyses: state.customerAnalyses ?? customerAnalyses,
    };
  },
  createImportBatch: async (batch: ImportBatch, user: User) =>
    storage.transaction((state) => {
      importActor(state, user, batch);
      const scopes = batch.snapshots.map(snapshotScope);
      if (
        new Set(scopes).size !== scopes.length ||
        new Set(batch.lines.map((l) => l.id)).size !== batch.lines.length
      )
        batch.findings.push({
          severity: "error",
          message:
            "Conflicting duplicate source records; resolve duplicate Entity / fiscal year / week or detail identifiers",
        });
      if (
        batch.snapshots.some((s) => !batch.entityIds.includes(s.entityId)) ||
        batch.lines.some((l) => !scopes.includes(snapshotScope(l)))
      )
        throw new ApiError(
          400,
          "Source records do not match the declared import scope",
        );
      if (
        !batch.entityIds.length ||
        batch.entityIds.some(
          (id) => !entities.some((e) => e.id === id && canEdit(user, e)),
        )
      )
        throw new ApiError(
          403,
          "Import contains entities outside your edit scope.",
        );
      if (!storageStatus().writable)
        throw new ApiError(
          503,
          "Configure persistent storage before submitting imports.",
        );
      state.batches.unshift(batch);
      state.audit.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        actor: user.id,
        action: "submit",
        subject: batch.id,
      });
      return batch;
    }),
  previewImportBatch: async (
    id: string,
    user: User,
    selected?: string[],
    updateTeamReporting?: boolean,
  ) => {
    if (updateTeamReporting !== undefined)
      return storage.transaction((state) => {
        const b = state.batches.find((b) => b.id === id);
        if (!b) throw new ApiError(404, "Review batch not found.");
        importActor(state, user, b);
        if (
          b.status !== "review" ||
          !b.snapshots.length ||
          b.adjustment ||
          b.receivablesKind ||
          b.customerAnalysis ||
          b.teamActualData
        )
          throw new ApiError(
            400,
            "Team reference selection requires a weekly sales review",
          );
        if (
          updateTeamReporting &&
          b.lines.some(
            (l) =>
              l.salesTeam &&
              (/^[-+]?\d+(\.\d+)?$/.test(l.salesTeam) ||
                /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(
                  l.salesTeam,
                )),
          )
        )
          throw new ApiError(
            400,
            "Team column contains amounts or month headers; review the workbook layout",
          );
        b.updateTeamReporting = updateTeamReporting;
        return previewImport(state, b, selected);
      });
    const state = await repository.read();
    const batch = state.batches.find((b) => b.id === id);
    if (!batch) throw new ApiError(404, "Review batch not found.");
    importActor(state, user, batch);
    return previewImport(state, batch, selected);
  },
  publishImportBatch: async (
    id: string,
    user: User,
    request:
      | { selectedScopes?: string[]; reviewVersion?: string; reason?: string }
      | boolean,
  ) =>
    storage.transaction((state) => {
      state.customerAnalyses ??= structuredClone(customerAnalyses);
      const batch = state.batches.find((b) => b.id === id);
      if (!batch) throw new ApiError(404, "Review batch not found.");
      return publishReviewed(
        state,
        batch,
        user,
        typeof request === "boolean" ? {} : request,
      );
    }),
  restoreImportBatch: async (
    id: string,
    user: User,
    version?: string,
    reason?: string,
  ) =>
    storage.transaction((state) => {
      const batch = state.batches.find((b) => b.id === id);
      if (!batch) throw new ApiError(404, "Review batch not found.");
      importActor(state, user, batch, true);
      if (user.role !== "superadmin")
        throw new ApiError(403, "Superadmin access required");
      return version
        ? restoreReviewed(state, batch, user, version, reason ?? "")
        : previewRestore(state, batch);
    }),
};
