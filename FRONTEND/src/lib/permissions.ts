import type { PermissionScope } from '@/api/generated/model'

/**
 * Permission keys (resource:action). Mirrors BACKEND Application/Identity/Permissions.cs.
 * The server is the authority; these only decide what the UI shows.
 */
export const P = {
  users: {
    read: 'users:read',
    manage: 'users:manage',
    create: 'users:create',
    resetPassword: 'users:reset-password',
    delete: 'users:delete',
    restore: 'users:restore',
  },
  roles: { read: 'roles:read', manage: 'roles:manage' },
  territories: {
    read: 'territories:read',
    manage: 'territories:manage',
    delete: 'territories:delete',
    restore: 'territories:restore',
  },
  customers: {
    read: 'customers:read',
    manage: 'customers:manage',
    create: 'customers:create',
    assign: 'customers:assign',
    delete: 'customers:delete',
    restore: 'customers:restore',
  },
  lookups: { manage: 'lookups:manage', delete: 'lookups:delete', restore: 'lookups:restore' },
  products: {
    read: 'products:read',
    manage: 'products:manage',
    delete: 'products:delete',
    restore: 'products:restore',
  },
  orders: {
    create: 'orders:create',
    read: 'orders:read',
    manage: 'orders:manage',
    deliver: 'orders:deliver',
    delete: 'orders:delete',
    restore: 'orders:restore',
  },
  visits: {
    read: 'visits:read',
    create: 'visits:create',
    manage: 'visits:manage',
    feedback: 'visits:feedback',
    delete: 'visits:delete',
    restore: 'visits:restore',
  },
  tracking: {
    report: 'tracking:report',
    viewLive: 'tracking:view-live',
    history: 'tracking:history',
    reviewFlags: 'tracking:review-flags',
    reviewSuspicious: 'tracking:review-suspicious',
  },
  devices: { read: 'devices:read', delete: 'devices:delete' },
  reports: { read: 'reports:read' },
  stats: { read: 'stats:read', export: 'stats:export' },
  audit: { read: 'audit:read' },
  settings: { manage: 'settings:manage' },
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

/** Dashboard = anything beyond a rep's own work (own location, own doctors, own orders). */
export function canUseDashboard(granted: Record<string, PermissionScope>): boolean {
  return (
    hasPermission(granted, P.tracking.viewLive) ||
    hasPermission(granted, P.users.read) ||
    hasPermission(granted, P.roles.read) ||
    hasPermission(granted, P.visits.read, 'team') ||
    hasPermission(granted, P.orders.read, 'team') ||
    hasPermission(granted, P.customers.read, 'team') ||
    hasPermission(granted, P.products.manage) ||
    hasPermission(granted, P.lookups.manage) ||
    hasPermission(granted, P.stats.read, 'team') ||
    hasPermission(granted, P.audit.read) ||
    hasPermission(granted, P.tracking.reviewSuspicious) ||
    hasPermission(granted, P.settings.manage)
  )
}
