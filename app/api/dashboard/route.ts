import { api, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { filtersFrom, getDashboardSnapshot } from "@/lib/dashboard";
import { storageStatus } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    return {
      ok: true,
      data: getDashboardSnapshot(
        await repository.read(),
        user,
        filtersFrom(new URL(request.url)),
      ),
      storage: storageStatus(),
    };
  });
}
