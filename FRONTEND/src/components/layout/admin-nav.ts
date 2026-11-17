import {
  BuildingIcon,
  ClipboardListIcon,
  ListChecksIcon,
  PackageIcon,
  ReceiptTextIcon,
  StethoscopeIcon,
  FlagIcon,
  LayoutDashboardIcon,
  MapIcon,
  MapPinnedIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { P, type PermissionKey } from '@/lib/permissions'

export type AdminPath =
  | '/admin'
  | '/admin/live-map'
  | '/admin/users'
  | '/admin/roles'
  | '/admin/territories'
  | '/admin/customers'
  | '/admin/doctors'
  | '/admin/orders'
  | '/admin/products'
  | '/admin/lookups'
  | '/admin/visits'
  | '/admin/flags'
  | '/admin/devices'

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
    ],
  },
  {
    title: 'nav.sections.field',
    items: [
      { to: '/admin/doctors', label: 'nav.doctors', icon: StethoscopeIcon, permission: P.customers.read },
      { to: '/admin/customers', label: 'nav.customers', icon: BuildingIcon, permission: P.customers.read },
      { to: '/admin/visits', label: 'nav.visits', icon: ClipboardListIcon, permission: P.visits.read },
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
    ],
  },
]
