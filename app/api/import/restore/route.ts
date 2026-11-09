import { api, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    const b = await request.json();
    return {
      ok: true,
      result: await repository.restoreImportBatch(
        b.id,
        user,
        b.reviewVersion,
        b.reason,
      ),
    };
  });
}
