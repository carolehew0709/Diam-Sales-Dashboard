import { api, ApiError, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import {
  getReceivables,
  hasReceivablesAccess,
  receivablesFiltersFrom,
} from "@/lib/receivables";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
    if (!hasReceivablesAccess(user))
      throw new ApiError(403, "Access to DEHK or DDC is required");
    const data = getReceivables(
      await repository.read(),
      user,
      receivablesFiltersFrom(new URL(request.url)),
    );
    return { ok: true, data };
  });
}
