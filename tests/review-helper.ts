import type { repository as Repository } from "../lib/repository";
import type { User } from "../lib/types";
import { batchScopes } from "../lib/import-review";
export async function reviewedPublish(
  repository: typeof Repository,
  id: string,
  user: User,
) {
  const batch = (await repository.read()).batches.find((b) => b.id === id)!;
  if (batch.status === "published")
    return repository.publishImportBatch(id, user, {});
  const preview = await repository.previewImportBatch(
    id,
    user,
    batchScopes(batch),
  );
  return repository.publishImportBatch(id, user, {
    selectedScopes: preview.selectedScopes,
    reviewVersion: preview.reviewVersion,
    reason: "Synthetic source reviewed for this test",
  });
}
