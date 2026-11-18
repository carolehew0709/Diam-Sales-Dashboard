import { createHash, createHmac, randomUUID } from "node:crypto";
import { api, ApiError, currentUser, sameOrigin } from "@/lib/auth";
import { entities } from "@/lib/entities";
import { canPublish } from "@/lib/permissions";
import {
  hasPipelineAccess,
  pipelineForWeek,
  pipelineTotals,
  weekStart,
  type PipelineSnapshot,
} from "@/lib/pipeline";
import {
  parsePipelineWorkbook,
  validPipelineDate,
} from "@/lib/pipeline-workbook";
import { storage, storageStatus } from "@/lib/storage";
import { archiveWorkbook } from "@/lib/workbook-intake";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    if (!hasPipelineAccess(user)) throw new ApiError(403, "common.noAccess");
    const state = await storage.read();
    return {
      ok: true,
      data: pipelineForWeek(
        state.pipelineSnapshots ?? [],
        user,
        new URL(request.url).searchParams.get("week"),
      ),
      publishable:
        storageStatus().writable &&
        entities.some((entity) => canPublish(user, entity)),
    };
  });
}

const maximumBytes = 12 * 1024 * 1024;

export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    if (!hasPipelineAccess(user) || !entities.some((entity) => canPublish(user, entity)))
      throw new ApiError(403, "common.noAccess");
    if (!storageStatus().writable)
      throw new ApiError(503, "pipeline.storageUnavailable");
    if (Number(request.headers.get("content-length")) > maximumBytes + 8192)
      throw new ApiError(413, "pipeline.fileError");
    const form = await request.formData();
    const file = form.get("file");
    const asOf = form.get("asOf");
    const commitment = form.get("review");
    if (
      !(file instanceof File) ||
      !/\.xlsx$/i.test(file.name) ||
      file.size > maximumBytes ||
      typeof asOf !== "string" ||
      !validPipelineDate(asOf)
    )
      throw new ApiError(400, "pipeline.fileError");
    const bytes = Buffer.from(await file.arrayBuffer());
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const parsed = (() => {
      try {
        return parsePipelineWorkbook(bytes, asOf);
      } catch (error) {
        const message =
          error instanceof Error &&
          /^pipeline\.(templateError|(invalidRow|dateBeforeSource):\d+)$/.test(
            error.message,
          )
            ? error.message
            : "pipeline.templateError";
        throw new ApiError(400, message);
      }
    })();
    const week = weekStart(asOf);
    const entityIds = [...new Set(parsed.rows.map((r) => r.entityId))].sort();
    const allowed = entities.filter(
      (entity) => entityIds.includes(entity.id) && canPublish(user, entity),
    );
    if (allowed.length !== entityIds.length)
      throw new ApiError(403, "common.noAccess");
    const inScope = (source: PipelineSnapshot) =>
      entityIds.includes(source.entityId) && weekStart(source.asOf) === week;
    const reviewToken = (previous: PipelineSnapshot[]) =>
      createHmac("sha256", process.env.DIAM_SESSION_SECRET!)
        .update(
          JSON.stringify([
            user.id,
            user.sessionVersion,
            asOf,
            file.name,
            fingerprint,
            previous.map((s) => s.id),
          ]),
        )
        .digest("hex");
    const sameFile = (source: PipelineSnapshot) =>
      source.asOf === asOf && source.fingerprint === fingerprint;
    if (commitment === null) {
      const previous = ((await storage.read()).pipelineSnapshots ?? []).filter(
        inScope,
      );
      return {
        ok: true,
        review: reviewToken(previous),
        week,
        asOf,
        sheet: parsed.sheet,
        currencyConflicts: parsed.currencyConflicts,
        unchanged: entityIds.every((id) =>
          previous.some((s) => s.entityId === id && sameFile(s)),
        ),
        scopes: allowed.map((entity) => ({
          entity: entity.code,
          previous:
            previous
              .filter((s) => s.entityId === entity.id)
              .sort((a, b) => b.asOf.localeCompare(a.asOf))[0]?.asOf ?? null,
          next: pipelineTotals(
            parsed.rows.filter((r) => r.entityId === entity.id),
          ),
        })),
      };
    }
    return storage.transaction(async (state) => {
      const actor = state.users.find(
        (candidate) =>
          candidate.id === user.id &&
          candidate.sessionVersion === user.sessionVersion,
      );
      if (!actor || allowed.some((entity) => !canPublish(actor, entity)))
        throw new ApiError(403, "common.noAccess");
      const snapshots = state.pipelineSnapshots ?? [];
      const previous = snapshots.filter(inScope);
      if (
        entityIds.every((id) =>
          previous.some((s) => s.entityId === id && sameFile(s)),
        )
      )
        return { ok: true, week };
      if (commitment !== reviewToken(previous))
        throw new ApiError(409, "pipeline.reviewExpired");
      await archiveWorkbook(bytes);
      const id = randomUUID();
      state.pipelineSnapshots = [
        ...snapshots.filter((s) => !(inScope(s) && s.asOf === asOf)),
        ...entityIds.map((entityId) => ({
          id,
          entityId,
          asOf,
          fileName: file.name,
          fingerprint,
          sheet: parsed.sheet,
          rows: parsed.rows.filter((r) => r.entityId === entityId),
        })),
      ];
      state.audit.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        actor: user.id,
        action: "publish-pipeline",
        subject: id,
      });
      return { ok: true, week };
    });
  });
}
