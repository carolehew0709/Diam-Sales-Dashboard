import { api, currentUser, ApiError } from "@/lib/auth";
import { storageStatus } from "@/lib/storage";
import { repository } from "@/lib/repository";
import { entities } from "@/lib/entities";
import { canEdit } from "@/lib/permissions";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const user = await currentUser();
    if (
      !["superadmin", "region_admin", "editor"].includes(user.role) ||
      user.systemIdentity
    )
      throw new ApiError(403, "Import access required");
    const state = await repository.read();
    const salesPeriods = entities
      .filter((entity) => canEdit(user, entity))
      .flatMap((entity) => {
        const latest = state.snapshots
          .filter((s) => s.entityId === entity.id)
          .sort((a, b) => b.year - a.year || b.week - a.week)[0];
        return latest
          ? [{ entityId: entity.id, year: latest.year, week: latest.week }]
          : [];
      });
    return { ok: true, storage: storageStatus(), salesPeriods };
  });
}
