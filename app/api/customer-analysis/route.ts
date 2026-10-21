import { api, currentUser } from "@/lib/auth";
import { repository } from "@/lib/repository";
import { filtersFrom } from "@/lib/dashboard";
import { customerAnalysisView } from "@/lib/customer-analysis";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await currentUser();
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
