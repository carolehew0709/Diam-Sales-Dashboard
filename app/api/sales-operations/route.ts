import { ApiError, api, currentUser } from "@/lib/auth";
import { entities } from "@/lib/entities";
import { canAccessModule, canView } from "@/lib/permissions";
import {
  salesOperationsOrder,
  salesOperationsView,
} from "@/lib/sales-operations";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    const entity = entities.find(({ id }) => id === "ddc")!;
    if (!canAccessModule(user, "sales-operations") || !canView(user, entity))
      throw new ApiError(403, "common.noAccess");
    const snapshot = (await storage.read()).salesOperations;
    if (!snapshot || snapshot.entityId !== "ddc")
      return { ok: true, data: null };
    const order = new URL(request.url).searchParams.get("order");
    if (!order) return { ok: true, data: salesOperationsView(snapshot) };
    const detail = salesOperationsOrder(snapshot, order);
    if (!detail) throw new ApiError(404, "salesOps.orderUnavailable");
    return { ok: true, data: detail };
  });
}
