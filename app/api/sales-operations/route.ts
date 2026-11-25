import { createHash, createHmac, randomUUID } from "node:crypto";
import { ApiError, api, currentUser, sameOrigin } from "@/lib/auth";
import { entities } from "@/lib/entities";
import { canAccessModule, canPublish, canView } from "@/lib/permissions";
import {
  salesOperationsOrder,
  salesOperationsView,
} from "@/lib/sales-operations";
import { storage, storageStatus } from "@/lib/storage";
import { parseSalesOperations } from "@/lib/sales-operations-parser";
import {
  opsExportKinds,
  type SalesOperationsSnapshot,
} from "@/lib/sales-operations-types";
import { archiveWorkbook } from "@/lib/workbook-intake";
import type { User } from "@/lib/types";

const ddc = entities.find(({ id }) => id === "ddc")!;
const canPublishOperations = (user: User) =>
  canAccessModule(user, "sales-operations") && canPublish(user, ddc);
const maxUpload = 20 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    if (!canAccessModule(user, "sales-operations") || !canView(user, ddc))
      throw new ApiError(403, "common.noAccess");
    const state = await storage.read();
    const snapshot = state.salesOperations;
    const publishable = storageStatus().writable && canPublish(user, ddc);
    const order = new URL(request.url).searchParams.get("order");
    if (!order)
      return {
        ok: true,
        publishable,
        data:
          snapshot?.entityId === "ddc"
            ? salesOperationsView(snapshot, state.teamActualData)
            : null,
      };
    const detail =
      snapshot?.entityId === "ddc"
        ? salesOperationsOrder(snapshot, order, state.teamActualData)
        : null;
    if (!detail) throw new ApiError(404, "salesOps.orderUnavailable");
    return { ok: true, data: detail };
  });
}

export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    if (!canPublishOperations(user)) throw new ApiError(403, "common.noAccess");
    if (!storageStatus().writable)
      throw new ApiError(503, "salesOps.importStorage");
    if (Number(request.headers.get("content-length")) > maxUpload + 8192)
      throw new ApiError(413, "salesOps.importFiles");
    const form = await request.formData().catch(() => {
      throw new ApiError(400, "salesOps.importFiles");
    });
    const files = opsExportKinds.map((kind) => form.get(kind));
    const isWorkbook = (file: FormDataEntryValue | null): file is File =>
      file instanceof File && file.size > 0 && /\.xlsx$/i.test(file.name);
    if (
      !files.every(isWorkbook) ||
      files.reduce((total, file) => total + file.size, 0) > maxUpload
    )
      throw new ApiError(400, "salesOps.importFiles");
    const load = async (file: File) => ({
      file: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    const [summary, detail, receivables, receipts] = await Promise.all(
      files.map(load),
    );
    const workbooks = [summary, detail, receivables, receipts];
    let next: SalesOperationsSnapshot;
    try {
      next = parseSalesOperations(summary, detail, receivables, receipts);
    } catch (error) {
      // These parser errors are source references and stay visible to the publisher.
      throw new ApiError(
        400,
        error instanceof Error ? error.message : "salesOps.importFiles",
      );
    }
    const digest = (value: string | Buffer) =>
      createHash("sha256").update(value).digest("hex");
    const fingerprint = digest(
      JSON.stringify(workbooks.map(({ file, bytes }) => [file, digest(bytes)])),
    );
    const reviewToken = (previous: SalesOperationsSnapshot | undefined) =>
      createHmac("sha256", process.env.DIAM_SESSION_SECRET!)
        .update(
          JSON.stringify([
            user.id,
            user.sessionVersion,
            fingerprint,
            previous ? digest(JSON.stringify(previous)) : null,
          ]),
        )
        .digest("hex");
    const review = form.get("review");
    function checkPeriod(previous: SalesOperationsSnapshot | undefined) {
      if (previous && next.asOf < previous.asOf)
        throw new ApiError(409, "salesOps.importOlder");
    }
    if (review === null) {
      const previous = (await storage.read()).salesOperations;
      checkPeriod(previous);
      const summarize = (snapshot: SalesOperationsSnapshot) => {
        const view = salesOperationsView(snapshot);
        const {
          from,
          asOf,
          shipmentCount,
          receivableCount,
          invoiceCount,
          receiptCount,
          missingOrderAmounts,
          currencies,
          orders,
        } = view;
        return {
          from,
          asOf,
          shipmentCount,
          receivableCount,
          invoiceCount,
          receiptCount,
          missingOrderAmounts,
          currencies,
          orders: orders.length,
        };
      };
      return {
        ok: true,
        review: reviewToken(previous),
        previous: previous ? summarize(previous) : null,
        next: summarize(next),
        unchanged: previous?.publication?.fingerprint === fingerprint,
      };
    }

    return storage.transaction(async (state) => {
      const actor = state.users.find(
        (candidate) =>
          candidate.id === user.id &&
          candidate.sessionVersion === user.sessionVersion,
      );
      if (!actor || !canPublishOperations(actor))
        throw new ApiError(403, "common.noAccess");
      const previous = state.salesOperations;
      if (previous?.publication?.fingerprint === fingerprint)
        return {
          ok: true,
          data: salesOperationsView(previous, state.teamActualData),
        };
      if (review !== reviewToken(previous))
        throw new ApiError(409, "salesOps.importRefresh");
      checkPeriod(previous);
      for (const { bytes } of workbooks) await archiveWorkbook(bytes);
      const id = randomUUID(),
        at = new Date().toISOString();
      next.publication = { id, at, fingerprint };
      state.salesOperations = next;
      state.audit.push({
        id: randomUUID(),
        at,
        actor: actor.id,
        action: "publish-sales-operations",
        subject: `DDC/${next.asOf}/${id}`,
      });
      return {
        ok: true,
        data: salesOperationsView(next, state.teamActualData),
      };
    });
  });
}
