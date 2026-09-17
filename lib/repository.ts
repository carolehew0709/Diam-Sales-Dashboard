import { randomUUID } from "node:crypto";
import { storage, storageStatus } from "./storage";
import { entities } from "./entities";
import { canEdit, canPublish } from "./permissions";
import { ApiError } from "./auth";
import type { ImportBatch, User } from "./types";
export const repository = {
  read: () => storage.read(),
  createImportBatch: async (batch: ImportBatch, user: User) =>
    storage.transaction((state) => {
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
  publishImportBatch: async (id: string, user: User, acknowledge: boolean) =>
    storage.transaction((state) => {
      const batch = state.batches.find((b) => b.id === id);
      if (!batch) throw new ApiError(404, "Review batch not found.");
      if (
        batch.entityIds.some(
          (id) => !entities.some((e) => e.id === id && canPublish(user, e)),
        )
      )
        throw new ApiError(403, "Publishing is not permitted for this entity.");
      if (batch.status === "published") return batch;
      if (
        batch.status !== "review" ||
        !batch.snapshots.length ||
        batch.findings.some((f) => f.severity === "error")
      )
        throw new ApiError(409, "Resolve validation errors before publishing.");
      if (batch.findings.some((f) => f.severity === "review") && !acknowledge)
        throw new ApiError(
          409,
          "Acknowledge the listed source limitations before publishing.",
        );
      const keys = new Set(
        batch.snapshots.map((s) => `${s.entityId}:${s.year}:${s.week}`),
      );
      const now = new Date().toISOString();
      state.snapshots = state.snapshots
        .filter((s) => !keys.has(`${s.entityId}:${s.year}:${s.week}`))
        .concat(batch.snapshots.map((s) => ({ ...s, publishedAt: now })));
      state.lines = state.lines
        .filter((l) => !keys.has(`${l.entityId}:${l.year}:${l.week}`))
        .concat(batch.lines);
      batch.status = "published";
      batch.publishedBy = user.id;
      batch.publishedAt = now;
      batch.revision = ++state.revision;
      state.audit.push({
        id: randomUUID(),
        at: now,
        actor: user.id,
        action: "publish",
        subject: batch.id,
      });
      return batch;
    }),
};
