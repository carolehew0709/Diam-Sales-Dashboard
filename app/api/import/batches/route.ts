import { api, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { canEdit } from "@/lib/permissions";
import { entities } from "@/lib/entities";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const user = await currentUser();
    const state = await repository.read();
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
