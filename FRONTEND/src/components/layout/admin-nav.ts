import {
  BarChart3Icon,
  BellIcon,
  BuildingIcon,
  ClipboardListIcon,
  HistoryIcon,
  ListChecksIcon,
  PackageIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShieldAlertIcon,
  StethoscopeIcon,
  FlagIcon,
  LayoutDashboardIcon,
  MapIcon,
  MapPinnedIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
// Relative so the phone-bar rules can be tested with plain Node.
import { hasPermission, P, type PermissionKey } from '../../lib/permissions.ts'
import type { PermissionScope } from '@/api/generated/model'

export type AdminPath =
  | '/admin'
  | '/admin/live-map'
  | '/admin/statistics'
  | '/admin/notifications'
  | '/admin/activity'
  | '/admin/users'
  | '/admin/roles'
  | '/admin/territories'
  | '/admin/customers'
  | '/admin/doctors'
  | '/admin/orders'
  | '/admin/products'
  | '/admin/lookups'
  | '/admin/visits'
  | '/admin/expenses'
  | '/admin/flags'
  | '/admin/suspicious-activity'
  | '/admin/devices'
  | '/admin/settings'

export interface AdminNavItem {
  to: AdminPath
  /** i18n key */
  label: string
  icon: LucideIcon
  /** Hidden unless the user holds this permission (any scope). Dashboard has none: /admin itself is guarded. */
  permission?: PermissionKey
  /** Live counter shown next to the label. */
  badge?: 'openFlags' | 'unhealthyDevices'
}

export interface AdminNavSection {
  /** i18n key */
  title: string
  items: AdminNavItem[]
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: 'nav.sections.overview',
    items: [
      { to: '/admin', label: 'nav.dashboard', icon: LayoutDashboardIcon },
      { to: '/admin/live-map', label: 'nav.liveMap', icon: MapIcon, permission: P.tracking.viewLive },
      { to: '/admin/statistics', label: 'nav.statistics', icon: BarChart3Icon, permission: P.stats.read },
      { to: '/admin/notifications', label: 'nav.notifications', icon: BellIcon },
    ],
  },
  {
    title: 'nav.sections.field',
    items: [
      { to: '/admin/doctors', label: 'nav.doctors', icon: StethoscopeIcon, permission: P.customers.read },
      { to: '/admin/customers', label: 'nav.customers', icon: BuildingIcon, permission: P.customers.read },
      { to: '/admin/visits', label: 'nav.visits', icon: ClipboardListIcon, permission: P.visits.read },
      { to: '/admin/expenses', label: 'nav.expenses', icon: WalletIcon, permission: P.expenses.read },
      {
        to: '/admin/territories',
        label: 'nav.territories',
        icon: MapPinnedIcon,
        permission: P.territories.read,
      },
    ],
  },
  {
    title: 'nav.sections.sales',
    items: [
      { to: '/admin/orders', label: 'nav.orders', icon: ReceiptTextIcon, permission: P.orders.read },
      { to: '/admin/products', label: 'nav.products', icon: PackageIcon, permission: P.products.read },
    ],
  },
  {
    title: 'nav.sections.tracking',
    items: [
      {
        to: '/admin/flags',
        label: 'nav.flags',
        icon: FlagIcon,
        permission: P.tracking.reviewFlags,
        badge: 'openFlags',
      },
      {
        to: '/admin/suspicious-activity',
        label: 'nav.suspicious',
        icon: ShieldAlertIcon,
        permission: P.tracking.reviewSuspicious,
      },
      {
        to: '/admin/devices',
        label: 'nav.devices',
        icon: SmartphoneIcon,
        permission: P.devices.read,
        badge: 'unhealthyDevices',
      },
    ],
  },
  {
    title: 'nav.sections.admin',
    items: [
      { to: '/admin/users', label: 'nav.users', icon: UsersIcon, permission: P.users.read },
      { to: '/admin/roles', label: 'nav.roles', icon: ShieldCheckIcon, permission: P.roles.read },
      { to: '/admin/lookups', label: 'nav.lookups', icon: ListChecksIcon, permission: P.lookups.manage },
      { to: '/admin/activity', label: 'nav.activity', icon: HistoryIcon, permission: P.audit.read },
      { to: '/admin/settings', label: 'nav.settings', icon: SettingsIcon, permission: P.settings.manage },
    ],
  },
]

/** Sections with only the items the user may open. */
export function allowedNav(granted: Record<string, PermissionScope>): AdminNavSection[] {
  return ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(granted, item.permission)),
  })).filter((section) => section.items.length > 0)
}

/**
 * The phone's bottom bar: the first four of these the user may open, most used first. Everything
 * else is under "More".
 */
const PHONE_PRIORITY: AdminPath[] = [
  '/admin',
  '/admin/live-map',
  '/admin/visits',
  '/admin/orders',
  '/admin/doctors',
  '/admin/expenses',
  '/admin/statistics',
  '/admin/suspicious-activity',
  '/admin/users',
  '/admin/customers',
  '/admin/products',
  '/admin/notifications',
]

export const PHONE_TAB_COUNT = 4

export function phoneTabs(granted: Record<string, PermissionScope>): AdminNavItem[] {
  const items = allowedNav(granted).flatMap((s) => s.items)
  const byPath = new Map(items.map((item) => [item.to, item]))
  const ranked = PHONE_PRIORITY.map((path) => byPath.get(path)).filter((item): item is AdminNavItem => !!item)
  const rest = items.filter((item) => !PHONE_PRIORITY.includes(item.to))
  return [...ranked, ...rest].slice(0, PHONE_TAB_COUNT)
}

/** True when `pathname` is the item's page (or below it). */
export function isActivePath(item: AdminNavItem, pathname: string): boolean {
  return item.to === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(item.to)
}
