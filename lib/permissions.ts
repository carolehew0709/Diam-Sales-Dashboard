import type { Entity, User, WorkspaceModule } from "./types";
import { isSalesPage, type Page } from "./routes";

export const workspaceModules: WorkspaceModule[] = [
  "overview",
  "pipeline",
  "sales-operations",
  "ar-aging",
  "quotation",
];

/** Configured access for editing, including disabled accounts and legacy defaults. */
export function userAccessPolicy(user: User): NonNullable<User["access"]> {
  return {
    modules: workspaceModules.filter(
      (module) =>
        user.access === undefined || user.access.modules.includes(module),
    ),
    export: user.access?.export !== false,
  };
}

export function canAccessModule(user: User, module: WorkspaceModule) {
  return (
    !user.disabled &&
    (user.access === undefined || user.access.modules.includes(module))
  );
}

export function canAccessPage(user: User, page: Page) {
  const module =
    isSalesPage(page) || page === "analysis" || page === "business-units"
      ? "overview"
      : page;
  return (
    !workspaceModules.includes(module as WorkspaceModule) ||
    canAccessModule(user, module as WorkspaceModule)
  );
}

export function canExportData(user: User) {
  return !user.disabled && user.access?.export !== false;
}

export function validUserAccess(
  value: unknown,
): value is NonNullable<User["access"]> {
  if (!value || typeof value !== "object") return false;
  const access = value as Partial<NonNullable<User["access"]>>;
  return (
    typeof access.export === "boolean" &&
    Array.isArray(access.modules) &&
    access.modules.every((module) => workspaceModules.includes(module))
  );
}
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
