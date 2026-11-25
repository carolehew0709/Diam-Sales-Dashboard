import { api, ApiError, currentUser } from "@/lib/auth";
import { filtersFrom } from "@/lib/dashboard";
import { canAccessModule } from "@/lib/permissions";
import { repository } from "@/lib/repository";
import { teamBudgetDetails } from "@/lib/team-budget-details";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    if (!canAccessModule(user, "overview"))
      throw new ApiError(403, "common.noAccess");
    const url = new URL(request.url);
    const filters = filtersFrom(url);
    if (filters.salesTeam === "all")
      throw new ApiError(400, "teamActual.detailUnavailable");
    const state = await repository.read();
    if (url.searchParams.get("revision") !== String(state.revision))
      throw new ApiError(409, "teamActual.detailRefresh");
    return { ok: true, data: teamBudgetDetails(state, user, filters) };
  });
}
