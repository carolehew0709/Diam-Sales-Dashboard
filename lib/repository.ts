import { importBatches, users } from './seed';
import { ImportBatch, User } from './types';

export const repository = {
  getUsers: (): User[] => users,
  getImports: (): ImportBatch[] => importBatches,
  createImportBatch: (batch: ImportBatch) => { importBatches.unshift(batch); return batch; },
  publishImportBatch: (id: string) => {
    const batch = importBatches.find((item) => item.id === id);
    if (batch) batch.status = 'published';
    return batch;
  },
};
