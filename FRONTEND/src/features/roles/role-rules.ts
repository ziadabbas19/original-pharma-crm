import type { QueryClient } from '@tanstack/react-query'
import type {
  PermissionGrantDto,
  PermissionScope,
  RoleDto,
  RoleSummaryDto,
  UserListItemDto,
} from '@/api/generated/model'
import { localizedName } from '@/lib/format'
import { SCOPE_RANK } from './permission-labels'

/**
 * Hierarchy rules, mirrored from BACKEND Application/Identity/RoleHierarchyRules.cs so the
 * dashboard can disable what the API would refuse. The API stays the authority.
 * A lower level number means more authority; a user's level is their best (lowest) role.
 */

export const TOP_LEVEL = 0
export const MAX_LEVEL = 1000
/** Level of someone without roles: outranks nobody. */
export const NO_ROLE_LEVEL = Number.POSITIVE_INFINITY

type Named = Pick<RoleSummaryDto, 'nameAr' | 'nameEn'>

/** The role's name in the UI language. Never show the key to people. */
export function roleName(role: Named): string {
  return localizedName(role.nameEn, role.nameAr)
}

export function bestLevel(roles: readonly { level: number }[]): number {
  return roles.reduce((min, role) => Math.min(min, role.level), NO_ROLE_LEVEL)
}

/** Manage (create, rename, edit, delete, assign) a role at `level`: strictly below you, or anything at the top level. */
export function canManageLevel(myLevel: number, level: number): boolean {
  return myLevel === TOP_LEVEL || level > myLevel
}

/** Lowest level number you may give a role. */
export function minAssignableLevel(myLevel: number): number {
  if (myLevel === TOP_LEVEL) return TOP_LEVEL
  return Number.isFinite(myLevel) ? Math.min(myLevel + 1, MAX_LEVEL) : MAX_LEVEL
}

/** Default level for a new role: just below the creator. */
export function defaultLevelBelow(myLevel: number): number {
  return Number.isFinite(myLevel) ? Math.min(myLevel + 1, MAX_LEVEL) : MAX_LEVEL
}

export function covers(held: PermissionScope | null | undefined, requested: PermissionScope): boolean {
  return !!held && SCOPE_RANK[held] >= SCOPE_RANK[requested]
}

/**
 * Whether you may set `key` to `requested` on a role that currently has `current`:
 * keeping or narrowing an existing grant is always fine; anything new or wider must be
 * covered by your own permissions.
 */
export function canGrant(
  mine: Record<string, PermissionScope>,
  key: string,
  current: PermissionScope | null,
  requested: PermissionScope,
): boolean {
  return (current !== null && SCOPE_RANK[current] >= SCOPE_RANK[requested]) || covers(mine[key], requested)
}

/** Grants of `source` you could not put on a role whose current grants are `current`. */
export function grantsBeyond(
  mine: Record<string, PermissionScope>,
  source: readonly PermissionGrantDto[],
  current: readonly PermissionGrantDto[] = [],
): PermissionGrantDto[] {
  return source.filter(
    (grant) =>
      !canGrant(mine, grant.key, current.find((c) => c.key === grant.key)?.scope ?? null, grant.scope),
  )
}

export type RoleLock = 'ownLevel' | 'aboveYou' | null

/** Why you cannot manage this role (translation key under roles.reason), or null when you can. */
export function roleLock(role: Pick<RoleDto, 'level'>, myLevel: number): RoleLock {
  if (canManageLevel(myLevel, role.level)) return null
  return role.level === myLevel ? 'ownLevel' : 'aboveYou'
}

/** Why you cannot change this user's roles or permissions, or null when you can. */
export function userLock(
  user: UserListItemDto,
  myId: string | undefined,
  myLevel: number,
): 'self' | 'userAboveYou' | null {
  if (user.id === myId) return 'self'
  return canManageLevel(myLevel, bestLevel(user.roles)) ? null : 'userAboveYou'
}

/** Everyone below `userId` in the reporting line (they cannot become the user's manager). */
export function reportsOf(users: readonly UserListItemDto[], userId: string): Set<string> {
  const result = new Set<string>()
  const queue = [userId]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const user of users) {
      if (user.managerId === current && !result.has(user.id) && user.id !== userId) {
        result.add(user.id)
        queue.push(user.id)
      }
    }
  }
  return result
}

/** Role and user lists, audit trails and overrides all change together after a role edit. */
export function invalidateRoleData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0]
      return typeof root === 'string' && (root.startsWith('/api/roles') || root.startsWith('/api/users'))
    },
  })
}
