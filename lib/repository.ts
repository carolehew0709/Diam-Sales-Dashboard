import { importBatches, users } from './seed';
import { ImportBatch, User } from './types';

export const repository = {
  getUsers: (): User[] => users,
  getImports: (): ImportBatch[] => importBatches,
  publishImportBatch: (id: string) => {
    const batch = importBatches.find((item) => item.id === id);
    if (batch) batch.status = 'published';
    return batch;
  },
};
