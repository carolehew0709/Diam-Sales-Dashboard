import { cookies } from "next/headers";
import {
  api,
  ApiError,
  sameOrigin,
  sessionToken,
  verifyPassword,
  publicUser,
} from "@/lib/auth";
import { storage } from "@/lib/storage";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const b = await request.json();
    if (
      typeof b.email !== "string" ||
      typeof b.password !== "string" ||
      b.password.length > 1024
    )
      throw new ApiError(400, "Email and password are required");
    const state = await storage.read();
    if (!state.users.length)
      throw new ApiError(503, "Administrator login is not configured");
    const user = state.users.find(
      (u) => u.email.toLowerCase() === b.email.toLowerCase() && !u.disabled,
    );
    if (!user || !verifyPassword(b.password, user.passwordHash))
      throw new ApiError(401, "Invalid email or password");
    (await cookies()).set("diam_session", sessionToken(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return { ok: true, user: publicUser(user) };
  });
}
export async function DELETE(request: Request) {
  return api(async () => {
    sameOrigin(request);
    (await cookies()).delete("diam_session");
    return { ok: true };
  });
}
