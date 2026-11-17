import type { TFunction } from 'i18next'
import type { PermissionDto, PermissionScope, RoleDto } from '@/api/generated/model'

export const SCOPES: PermissionScope[] = ['own', 'team', 'territory', 'all']

export const SCOPE_RANK: Record<PermissionScope, number> = { own: 1, team: 2, territory: 3, all: 4 }

export function widerScope(a: PermissionScope | null, b: PermissionScope | null): PermissionScope | null {
  if (!a) return b
  if (!b) return a
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b
}

export function splitKey(key: string): { resource: string; action: string } {
  const i = key.indexOf(':')
  return i < 0 ? { resource: key, action: '' } : { resource: key.slice(0, i), action: key.slice(i + 1) }
}

/** "users:read" -> translated label; falls back to the server description. */
export function permissionLabel(t: TFunction, key: string, fallback?: string): string {
  const { resource, action } = splitKey(key)
  return t(`permissionNames.${resource}.${action}`, { defaultValue: fallback ?? key })
}

export function resourceLabel(t: TFunction, resource: string): string {
  return t(`resources.${resource}`, { defaultValue: resource })
}

export interface PermissionGroup {
  resource: string
  items: PermissionDto[]
}

/** Keeps the server order (resource, then action) and groups by resource. */
export function groupPermissions(permissions: PermissionDto[]): PermissionGroup[] {
  const groups: PermissionGroup[] = []
  for (const permission of permissions) {
    const last = groups.at(-1)
    if (last?.resource === permission.resource) last.items.push(permission)
    else groups.push({ resource: permission.resource, items: [permission] })
  }
  return groups
}

/** Widest scope per permission across the given roles (how the API merges role grants). */
export function scopesFromRoles(roles: RoleDto[], roleKeys: string[]): Record<string, PermissionScope> {
  const result: Record<string, PermissionScope> = {}
  for (const role of roles) {
    if (!roleKeys.includes(role.key)) continue
    for (const grant of role.permissions) {
      result[grant.key] = widerScope(result[grant.key] ?? null, grant.scope) ?? grant.scope
    }
  }
  return result
}
