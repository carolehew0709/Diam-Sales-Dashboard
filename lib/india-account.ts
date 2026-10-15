import type { User } from "./types";
import { passwordHash as encodePassword } from "./passwords";

/** Optional server-side bootstrap for hosting without a database. */
export function configuredIndiaEditor(env: Record<string, string | undefined>): User | null {
  const email = env.DIAM_INDIA_EMAIL?.trim().toLowerCase();
  const password = env.DIAM_INDIA_PASSWORD;
  if (password && password.length < 12) return null;
  const passwordHash = password ? encodePassword(password) : env.DIAM_INDIA_PASSWORD_HASH;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !passwordHash || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) return null;
  return {
    id: "india-editor", name: "India Editor", email,
    role: "editor", region: "APAC", crossRegionView: false,
    permissions: { ddi: ["view", "edit"] }, passwordHash, sessionVersion: 1,
  };
}
