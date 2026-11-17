import type { PermissionScope } from '@/api/generated/model'

/**
 * Permission keys (resource:action). Mirrors BACKEND Application/Identity/Permissions.cs.
 * The server is the authority; these only decide what the UI shows.
 */
export const P = {
  users: { read: 'users:read', manage: 'users:manage' },
  roles: { read: 'roles:read', manage: 'roles:manage' },
  territories: { read: 'territories:read', manage: 'territories:manage' },
  customers: { read: 'customers:read', manage: 'customers:manage' },
  visits: { read: 'visits:read', create: 'visits:create', manage: 'visits:manage' },
  tracking: {
    report: 'tracking:report',
    viewLive: 'tracking:view-live',
    history: 'tracking:history',
    reviewFlags: 'tracking:review-flags',
  },
  devices: { read: 'devices:read' },
  reports: { read: 'reports:read' },
} as const

type Leaves<T> = T extends string ? T : { [K in keyof T]: Leaves<T[K]> }[keyof T]
export type PermissionKey = Leaves<typeof P>

const scopeRank: Record<PermissionScope, number> = { own: 1, team: 2, territory: 3, all: 4 }

/** True when the user has the permission with at least `minScope` (default: any scope). */
export function hasPermission(
  granted: Record<string, PermissionScope>,
  key: PermissionKey | string,
  minScope?: PermissionScope,
): boolean {
  const scope = granted[key]
  if (!scope) return false
  return minScope ? scopeRank[scope] >= scopeRank[minScope] : true
}

/** Dashboard = anything beyond reporting your own location. */
export function canUseDashboard(granted: Record<string, PermissionScope>): boolean {
  return (
    hasPermission(granted, P.tracking.viewLive) ||
    hasPermission(granted, P.users.read) ||
    hasPermission(granted, P.roles.read) ||
    hasPermission(granted, P.visits.read, 'team')
  )
}
