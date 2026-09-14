import { entities, importBatches, users, weekly } from './seed';
import { EntityWeekSnapshot, ImportBatch, OrderBookLine, User } from './types';

const orderBookLines: OrderBookLine[] = [];
const snapshots: EntityWeekSnapshot[] = [];

export const repository = {
  getUsers: (): User[] => users,
  getImports: (): ImportBatch[] => importBatches,
  createImportBatch: (batch: ImportBatch) => { importBatches.unshift(batch); return batch; },
  publishImportBatch: (id: string) => {
    const batch = importBatches.find((item) => item.id === id);
    if (batch) {
      batch.status = 'published';
      if (batch.parsedLines) orderBookLines.push(...batch.parsedLines);
      if (batch.parsedSnapshots) {
        snapshots.push(...batch.parsedSnapshots);
        for (const snapshot of batch.parsedSnapshots) {
          const entity = entities.find((item) => item.id === snapshot.entityId || item.name.toLowerCase() === snapshot.entityName.toLowerCase());
          const entityId = entity?.id ?? snapshot.entityId;
          const existing = weekly.find((record) => record.entityId === entityId && record.week === snapshot.week);
          const record = {
            entityId,
            week: snapshot.week,
            budget: entity?.budget ?? 0,
            sales: snapshot.ytdTurnoverExternal + snapshot.ytdTurnoverGroup,
            orderbook: snapshot.orderbook2026External + snapshot.orderbook2026Group,
            forecast: snapshot.forecast2026,
            p1: 0,
            source: `${snapshot.sourceFile} · ${snapshot.sourceSheet}`,
            isSnapshot: true,
          };
          if (existing) Object.assign(existing, record);
          else weekly.push(record);
        }
      }
    }
    return batch;
  },
  getOrderBookLines: (): OrderBookLine[] => orderBookLines,
  getSnapshots: (): EntityWeekSnapshot[] => snapshots,
};
