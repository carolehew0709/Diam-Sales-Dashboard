import { randomUUID } from "node:crypto";
import { ApiError } from "./auth";
import { passwordHash } from "./passwords";
import type { Store, User } from "./types";

export function managementActor(state: Store, actor: User) {
  const live = state.users.find((u) => u.id === actor.id);
  if (
    !live ||
    live.disabled ||
    live.systemIdentity ||
    live.role !== "superadmin" ||
    (live.sessionVersion ?? 1) !== (actor.sessionVersion ?? 1)
  )
    throw new ApiError(403, "Active Super Admin access required");
  return live;
}
export function manageableUser(state: Store, id: string) {
  const user = state.users.find((u) => u.id === id);
  if (!user) throw new ApiError(404, "Account not found");
  if (user.systemIdentity)
    throw new ApiError(403, "System identities cannot be managed here");
  return user;
}
export function accountAudit(
  state: Store,
  actor: User,
  target: User,
  action: string,
) {
  state.audit.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: actor.id,
    subject: target.id,
    action,
  });
}
export function guardAdministrator(
  state: Store,
  actor: User,
  previous: User,
  next: User,
) {
  if (actor.id === next.id && (next.disabled || next.role !== "superadmin"))
    throw new ApiError(400, "Keep your own administrator account active");
  if (
    previous.role === "superadmin" &&
    !previous.disabled &&
    (next.disabled || next.role !== "superadmin") &&
    !state.users.some(
      (u) =>
        u.id !== next.id &&
        !u.disabled &&
        !u.systemIdentity &&
        u.role === "superadmin",
    )
  )
    throw new ApiError(409, "Keep at least one active Super Admin");
}
export function validatePassword(password: unknown) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1024
  )
    throw new ApiError(400, "Use a password of 12 to 1024 characters");
  return password;
}
export function resetAccountPassword(
  state: Store,
  actor: User,
  id: string,
  password: unknown,
  confirmation: unknown,
) {
  managementActor(state, actor);
  const user = manageableUser(state, id);
  const value = validatePassword(password);
  if (value !== confirmation) throw new ApiError(400, "Passwords do not match");
  user.passwordHash = passwordHash(value);
  user.sessionVersion = (user.sessionVersion ?? 1) + 1;
  accountAudit(state, actor, user, "reset-password");
  return { ok: true, reauthenticate: actor.id === user.id };
}
export function setAccountStatus(
  state: Store,
  actor: User,
  id: string,
  disabled: unknown,
) {
  managementActor(state, actor);
  if (typeof disabled !== "boolean")
    throw new ApiError(400, "Provide account status");
  const user = manageableUser(state, id);
  guardAdministrator(state, actor, user, { ...user, disabled });
  if (!!user.disabled !== disabled) {
    user.disabled = disabled;
    user.sessionVersion = (user.sessionVersion ?? 1) + 1;
    accountAudit(
      state,
      actor,
      user,
      disabled ? "disable-account" : "restore-account",
    );
  }
  return user;
}
export function securityChanged(previous: User, next: User) {
  const permissions = (u: User) =>
    JSON.stringify(
      Object.entries(u.permissions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, p]) => [id, [...p].sort()]),
    );
  return (
    previous.email !== next.email ||
    previous.role !== next.role ||
    previous.region !== next.region ||
    previous.crossRegionView !== next.crossRegionView ||
    !!previous.disabled !== !!next.disabled ||
    previous.passwordHash !== next.passwordHash ||
    permissions(previous) !== permissions(next)
  );
}
