import { api, ApiError, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { hasReceivablesAccess } from "@/lib/receivables";
import { getReceivablesTrends } from "@/lib/receivables-trends";

export const dynamic = "force-dynamic";

export async function GET() {
  return api(async () => {
    const user = await currentUser();
    if (!hasReceivablesAccess(user))
      throw new ApiError(403, "Access to DEHK or DDC is required");
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return {
      ok: true,
      data: getReceivablesTrends(await repository.read(), user, today),
    };
  });
}
