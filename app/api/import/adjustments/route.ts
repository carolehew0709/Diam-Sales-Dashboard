import { api, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { entities } from "@/lib/entities";
import { canEdit } from "@/lib/permissions";
export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser(),
      state = await repository.read(),
      q =
        new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
    const allowed = (state.receivables ?? []).filter((r) =>
      (r.entityId === "china-payments" ? ["dhk", "ddc"] : [r.entityId]).every(
        (id) => entities.some((e) => e.id === id && canEdit(user, e)),
      ),
    );
    return {
      ok: true,
      records: q
        ? allowed
            .filter((r) =>
              [r.id, r.customer, r.invoiceNumber].some((v) =>
                v.toLowerCase().includes(q),
              ),
            )
            .slice(0, 50)
        : [],
      total: allowed.length,
    };
  });
}
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser(),
      input = await request.json();
    return {
      ok: true,
      batch: await repository.createAdjustmentBatch(input, user),
    };
  });
}
