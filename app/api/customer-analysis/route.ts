import { api, currentUser, ApiError } from "@/lib/auth";
import { canAccessModule } from "@/lib/permissions";
import { repository } from "@/lib/repository";
import { filtersFrom } from "@/lib/dashboard";
import { customerAnalysisView } from "@/lib/customer-analysis";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    if (!canAccessModule(user, "overview")) throw new ApiError(403, "common.noAccess");
    const url = new URL(request.url);
    return {
      ok: true,
      data: customerAnalysisView(
        await repository.read(),
        user,
        filtersFrom(url),
        url.searchParams.get("month"),
      ),
    };
  });
}
