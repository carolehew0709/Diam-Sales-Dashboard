import { api, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    const b = await request.json();
    return {
      ok: true,
      preview: await repository.previewImportBatch(
        b.id,
        user,
        b.selectedScopes,
        typeof b.updateTeamReporting==='boolean'?b.updateTeamReporting:undefined,
      ),
    };
  });
}
