import { api, ApiError, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { manualBatch } from "@/lib/import-validation";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    if (!["superadmin", "region_admin", "editor"].includes(user.role))
      throw new ApiError(403, "Import access required");
    return {
      ok: true,
      batch: await repository.createImportBatch(
        manualBatch(await request.json(), user),
        user,
      ),
    };
  });
}
