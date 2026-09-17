import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";
import source from "@/data/apac-dashboard.json";
import { entities } from "./entities";
import type { Store, Snapshot, OrderBookLine } from "./types";
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function initial(): Store {
  const seed = source as unknown as {
    snapshots: Snapshot[];
    lines: OrderBookLine[];
  };
  const password = process.env.DIAM_ADMIN_PASSWORD;
  return {
    version: 2,
    revision: 1,
    users: password
      ? [
          {
            id: "admin",
            name: "APAC Administrator",
            email: process.env.DIAM_ADMIN_EMAIL ?? "admin@diam.local",
            role: "superadmin",
            region: "APAC",
            crossRegionView: false,
            permissions: Object.fromEntries(
              entities.map((e) => [e.id, ["view", "edit"]]),
            ),
            passwordHash: passwordHash(password),
            sessionVersion: 1,
          },
        ]
      : [],
    snapshots: seed.snapshots ?? [],
    lines: seed.lines ?? [],
    batches: [],
    audit: [],
  };
}
export interface StorageAdapter {
  read(): Promise<Store>;
  transaction<T>(update: (state: Store) => T | Promise<T>): Promise<T>;
}
const storageFile = () =>
  path.resolve(process.env.DIAM_DATA_PATH ?? ".local/dashboard-store.json");
let queue: Promise<unknown> = Promise.resolve();
async function fileRead() {
  try {
    return JSON.parse(await fs.readFile(storageFile(), "utf8")) as Store;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return initial();
  }
}
export const fileAdapter: StorageAdapter = {
  read: async () => {
    await queue;
    return fileRead();
  },
  transaction: async (update) => {
    if (process.env.VERCEL)
      throw new Error(
        "Persistent storage is not configured. Set DATABASE_URL before publishing or managing users.",
      );
    const task = queue.then(async () => {
      const file = storageFile();
      const state = await fileRead();
      const result = await update(state);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(temp, JSON.stringify(state));
      await fs.rename(temp, file);
      return result;
    });
    queue = task.catch(() => {});
    return task;
  },
};
let pool: Pool | undefined;
let ready: Promise<unknown> | undefined;
async function database() {
  if (!pool)
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  if (!ready)
    ready = pool.query(
      "CREATE TABLE IF NOT EXISTS diam_dashboard_state (id integer PRIMARY KEY, payload jsonb NOT NULL)",
    );
  await ready;
  return pool;
}
export const postgresAdapter: StorageAdapter = {
  read: async () => {
    const db = await database();
    const result = await db.query(
      "SELECT payload FROM diam_dashboard_state WHERE id=1",
    );
    return result.rows[0]?.payload ?? initial();
  },
  transaction: async (update) => {
    const db = await database();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(7312601)");
      const result = await client.query(
        "SELECT payload FROM diam_dashboard_state WHERE id=1 FOR UPDATE",
      );
      const state: Store = result.rows[0]?.payload ?? initial();
      const value = await update(state);
      await client.query(
        "INSERT INTO diam_dashboard_state(id,payload) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload",
        [JSON.stringify(state)],
      );
      await client.query("COMMIT");
      return value;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
export const storage: StorageAdapter = process.env.DATABASE_URL
  ? postgresAdapter
  : fileAdapter;
export const storageStatus = () => ({
  kind: process.env.DATABASE_URL
    ? "postgres"
    : process.env.VERCEL
      ? "unconfigured"
      : "local-file",
  writable: !!process.env.DATABASE_URL || !process.env.VERCEL,
});
