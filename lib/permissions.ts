import { Entity, Permission, Role, User } from './types';

export function canView(user: User, entity: Entity): boolean {
  if (user.role === 'superadmin') return true;
  if (user.region !== entity.region && !user.crossRegionView) return false;
  return user.permissions[entity.id]?.includes('view') ?? false;
}

export function canEdit(user: User, entity: Entity): boolean {
  if (user.role === 'viewer') return false;
  if (user.role === 'superadmin') return true;
  return canView(user, entity) && (user.permissions[entity.id]?.includes('edit') ?? false);
}

export function roleLabel(role: Role) { return ({ superadmin: 'Superadmin', apac_admin: 'APAC admin', editor: 'Editor', viewer: 'Viewer', audit_viewer: 'Audit read-only' })[role]; }
export function togglePermission(user: User, entityId: string, permission: Permission): User {
  const current = user.permissions[entityId] ?? [];
  const next = current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission];
  return { ...user, permissions: { ...user.permissions, [entityId]: next } };
}
