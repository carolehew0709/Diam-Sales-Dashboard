import { api, currentUser, sameOrigin } from "@/lib/auth";
import { repository } from "@/lib/repository";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await currentUser();
    const b = await request.json();
    return {
      ok: true,
      batch: await repository.publishImportBatch(
        String(b.id),
        user,
        b.acknowledge === true,
      ),
    };
  });
}
