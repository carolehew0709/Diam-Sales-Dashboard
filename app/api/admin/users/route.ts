import { randomUUID } from "node:crypto";
import { api, ApiError, currentUser, publicUser, sameOrigin } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { storage, passwordHash } from "@/lib/storage";
import { entities } from "@/lib/entities";
import type { User } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const user = await currentUser();
    if (!canManageUsers(user))
      throw new ApiError(403, "Superadmin access required");
    return { ok: true, users: (await storage.read()).users.map(publicUser) };
  });
}
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const actor = await currentUser();
    if (!canManageUsers(actor))
      throw new ApiError(403, "Superadmin access required");
    const b = await request.json();
    const roles = [
      "superadmin",
      "region_admin",
      "editor",
      "viewer",
      "audit_viewer",
    ];
    if (
      !roles.includes(b.role) ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      typeof b.email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(b.email) ||
      b.region !== "APAC"
    )
      throw new ApiError(400, "Provide name, valid email, role and APAC scope");
    if (
      b.password !== undefined &&
      (typeof b.password !== "string" || b.password.length < 12)
    )
      throw new ApiError(400, "Use a password of at least 12 characters");
    const permissions: User["permissions"] = {};
    for (const e of entities) {
      const p = b.permissions?.[e.id] ?? [];
      if (
        !Array.isArray(p) ||
        p.some((v) => !["view", "edit"].includes(v)) ||
        (p.includes("edit") && !p.includes("view"))
      )
        throw new ApiError(400, "Edit permission also requires View");
      permissions[e.id] = p;
    }
    return storage.transaction((state) => {
      const existing = state.users.find((u) => u.id === b.id);
      if (!existing && !b.password)
        throw new ApiError(400, "Password is required for a new account");
      if (
        state.users.some(
          (u) =>
            u.email.toLowerCase() === b.email.toLowerCase() &&
            u.id !== existing?.id,
        )
      )
        throw new ApiError(409, "Email already exists");
      if (existing?.id === actor.id && (b.disabled || b.role !== "superadmin"))
        throw new ApiError(400, "Keep your own administrator account active");
      const next: User = {
        id: existing?.id ?? randomUUID(),
        name: b.name.trim(),
        email: b.email.toLowerCase(),
        role: b.role,
        region: "APAC",
        crossRegionView: b.crossRegionView === true,
        permissions,
        disabled: b.disabled === true,
        passwordHash: b.password
          ? passwordHash(b.password)
          : existing?.passwordHash,
        sessionVersion: (existing?.sessionVersion ?? 0) + 1,
      };
      state.users = state.users.filter((u) => u.id !== next.id).concat(next);
      state.audit.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        actor: actor.id,
        action: "update-user",
        subject: next.id,
      });
      return { ok: true, user: publicUser(next) };
    });
  });
}
