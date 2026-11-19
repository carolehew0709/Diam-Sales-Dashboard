import { api, currentUser, ApiError } from "@/lib/auth";
import { canAccessModule } from "@/lib/permissions";
import { repository } from "@/lib/repository";
import { filtersFrom, getDashboardSnapshot } from "@/lib/dashboard";
import { storageStatus } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const url = new URL(request.url);
    const user = await currentUser();
    if (!canAccessModule(user, "overview")) throw new ApiError(403, "common.noAccess");
    return {
      ok: true,
      data: getDashboardSnapshot(
        await repository.read(),
        user,
        filtersFrom(url),
        { includeHistory: url.searchParams.get("summary") !== "1" },
      ),
      storage: storageStatus(),
    };
  });
}
