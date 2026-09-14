import { Entity, Permission, Role, User } from './types';

export function canView(user: User, entity: Entity): boolean {
  if (user.role === 'superadmin' || user.role === 'editor') return true;
  if (user.region !== entity.region && !user.crossRegionView) return false;
  return user.permissions[entity.id]?.includes('view') ?? false;
}

export function canEdit(user: User, entity: Entity): boolean {
  if (user.role === 'viewer' || user.role === 'audit_viewer') return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'editor') return true;
  return canView(user, entity) && (user.permissions[entity.id]?.includes('edit') ?? false);
}

export function canPublish(user: User, entity: Entity): boolean { return user.role === 'superadmin' || (user.role === 'region_admin' && canEdit(user, entity)); }
export function canManageUsers(user: User) { return user.role === 'superadmin'; }
export function roleLabel(role: Role) { return ({ superadmin: 'Superadmin', region_admin: 'Region admin', editor: 'Global editor', viewer: 'Viewer', audit_viewer: 'Audit read-only' })[role]; }
export function togglePermission(user: User, entityId: string, permission: Permission): User {
  const current = user.permissions[entityId] ?? [];
  const next = current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission];
  return { ...user, permissions: { ...user.permissions, [entityId]: next } };
}
