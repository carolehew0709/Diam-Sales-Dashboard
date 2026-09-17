import { createHmac, timingSafeEqual, scryptSync } from "node:crypto";
import { cookies } from "next/headers";
import { storage } from "./storage";
import { publicUser } from "./permissions";
import type { User } from "./types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function verifyPassword(password: string, encoded?: string) {
  if (!encoded) return false;
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function secret() {
  const value = process.env.DIAM_SESSION_SECRET;
  if (!value || value.length < 32)
    throw new ApiError(
      503,
      "Login is not configured. Set DIAM_SESSION_SECRET and administrator credentials.",
    );
  return value;
}
export function sessionToken(user: User) {
  const body = Buffer.from(
    JSON.stringify({
      id: user.id,
      v: user.sessionVersion ?? 1,
      expires: Date.now() + 8 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export async function currentUser(): Promise<User> {
  const token = (await cookies()).get("diam_session")?.value;
  if (!token) throw new ApiError(401, "Please sign in.");
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new ApiError(401, "Invalid session.");
  const expected = createHmac("sha256", secret()).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new ApiError(401, "Invalid session.");
  let decoded: { id: string; v: number; expires: number };
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new ApiError(401, "Invalid session.");
  }
  if (decoded.expires < Date.now()) throw new ApiError(401, "Session expired.");
  const state = await storage.read();
  const user = state.users.find(
    (u) =>
      u.id === decoded.id &&
      !u.disabled &&
      (u.sessionVersion ?? 1) === decoded.v,
  );
  if (!user) throw new ApiError(401, "Account unavailable.");
  return user;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    (new URL(origin).host !==
      (request.headers.get("host") ?? new URL(request.url).host) ||
      new URL(origin).protocol !==
        `${request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")}:`)
  )
    throw new ApiError(403, "Cross-origin request rejected.");
}
export async function api(action: () => Promise<unknown> | unknown) {
  try {
    return Response.json(await action(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return Response.json(
      {
        ok: false,
        error:
          status === 500
            ? "The request could not be completed. Check server configuration."
            : (error as Error).message,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export { publicUser };
