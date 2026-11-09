import { api, ApiError, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { canEdit } from "@/lib/permissions";
import { entities } from "@/lib/entities";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    if (
      !["superadmin", "region_admin", "editor"].includes(user.role) ||
      user.systemIdentity
    )
      throw new ApiError(403, "Import access required");
    const state = await repository.read();
    const query = request ? new URL(request.url).searchParams : undefined;
    const visible = state.batches.filter((b) =>
      b.entityIds.every((id) =>
        entities.some((e) => e.id === id && canEdit(user, e)),
      ),
    );
    if (query?.get("id")) {
      const batch = visible.find((b) => b.id === query.get("id"));
      if (!batch) throw new ApiError(404, "Review batch not found.");
      return { ok: true, batch };
    }
    if (query?.get("summary") === "1")
      return {
        ok: true,
        batches: visible.map(
          ({
            id,
            fileName,
            sourceType,
            status,
            entityIds,
            submittedBy,
            submittedAt,
            publishedAt,
            publishedBy,
            revision,
          }) => ({
            id,
            fileName,
            sourceType,
            status,
            entityIds,
            submittedBy,
            submittedAt,
            publishedAt,
            publishedBy,
            revision,
          }),
        ),
      };
    return {
      ok: true,
      batches: state.batches.filter((b) =>
        b.entityIds.every((id) =>
          entities.some((e) => e.id === id && canEdit(user, e)),
        ),
      ),
    };
  });
}
