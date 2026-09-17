import type { Entity, User } from "./types";
export function canView(user: User, entity: Entity) {
  if (user.disabled) return false;
  if (user.role === "superadmin") return entity.region === "APAC";
  return (
    (user.region === entity.region || user.crossRegionView) &&
    (user.permissions[entity.id]?.includes("view") ?? false)
  );
}
export function canEdit(user: User, entity: Entity) {
  if (!canView(user, entity)) return false;
  if (user.role === "superadmin") return true;
  if (user.region !== entity.region) return false;
  return (
    ["region_admin", "editor"].includes(user.role) &&
    (user.permissions[entity.id]?.includes("edit") ?? false)
  );
}
export function canPublish(user: User, entity: Entity) {
  return (
    ["superadmin", "region_admin"].includes(user.role) && canEdit(user, entity)
  );
}
export function canManageUsers(user: User) {
  return !user.disabled && user.role === "superadmin";
}
export function publicUser(user: User) {
  const { passwordHash, ...safe } = user;
  return safe;
}
