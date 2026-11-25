import {
  BarChart3Icon,
  BellIcon,
  CalendarCheckIcon,
  ClipboardListIcon,
  ClipboardPlusIcon,
  HeartPulseIcon,
  HospitalIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  NotebookPenIcon,
  NotebookTextIcon,
  PackageIcon,
  PillIcon,
  PlayIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  SquarePlusIcon,
  StethoscopeIcon,
  UserPlusIcon,
  UserRoundIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import type { PermissionScope } from '@/api/generated/model'
// Relative so the catalog rules can be tested with plain Node.
import { canUseDashboard, hasPermission, P, tracksLocation } from '../../lib/permissions.ts'

type Granted = Record<string, PermissionScope>

/**
 * Shortcut actions of the phone Home, by stable key. The server keeps the same list of keys
 * (BACKEND Application/Identity/HomeShortcuts.cs); add a key in both places.
 */
export const SHORTCUT_KEYS = [
  'startVisit',
  'todayPlan',
  'weeklyPlan',
  'newOrder',
  'orders',
  'newExpense',
  'expenses',
  'newNote',
  'notes',
  'addDoctor',
  'doctors',
  'pharmacies',
  'addPharmacy',
  'places',
  'products',
  'notifications',
  'statistics',
  'myVisits',
  'account',
  'trackingHealth',
  'management',
] as const

export type ShortcutKey = (typeof SHORTCUT_KEYS)[number]

export const MAX_SHORTCUTS = 8

/** Screens a shortcut can open. */
export type ShortcutPath =
  | '/admin'
  | '/admin/products'
  | '/rep/doctors'
  | '/rep/expenses'
  | '/rep/notes'
  | '/rep/notifications'
  | '/rep/orders'
  | '/rep/orders/new'
  | '/rep/plans'
  | '/rep/settings'
  | '/rep/statistics'
  | '/rep/tracking-health'
  | '/rep/visits'

/** Search of /rep/doctors: which tab opens, and whether its "Add" sheet opens at once. */
export interface DoctorsSearch {
  tab?: 'doctors' | 'pharmacies' | 'places'
  add?: boolean
}

/** A screen of the app, or an action Home runs itself (the existing flows, nothing bypassed). */
export type ShortcutTarget =
  | { kind: 'route'; to: ShortcutPath; search?: DoctorsSearch }
  | { kind: 'action'; action: 'startVisit' | 'todayPlan' | 'newNote' }

export interface ShortcutDef {
  key: ShortcutKey
  /** i18n key of the label. */
  label: string
  icon: LucideIcon
  target: ShortcutTarget
  /** The user may use it (the server still checks every request). */
  allowed: (granted: Granted) => boolean
  /** Count shown on the tile when there is something to look at. */
  badge?: 'unreadNotifications' | 'dueReminders'
}

const anyone = () => true
const can = (key: Parameters<typeof hasPermission>[1]) => (granted: Granted) => hasPermission(granted, key)
const route = (to: ShortcutPath, search?: DoctorsSearch): ShortcutTarget => ({ kind: 'route', to, search })
const action = (name: 'startVisit' | 'todayPlan' | 'newNote'): ShortcutTarget => ({
  kind: 'action',
  action: name,
})

export const SHORTCUTS: Record<ShortcutKey, ShortcutDef> = {
  startVisit: {
    key: 'startVisit',
    label: 'shortcuts.items.startVisit',
    icon: PlayIcon,
    target: action('startVisit'),
    allowed: can(P.visits.create),
  },
  todayPlan: {
    key: 'todayPlan',
    label: 'shortcuts.items.todayPlan',
    icon: ListChecksIcon,
    target: action('todayPlan'),
    allowed: can(P.visits.create),
  },
  weeklyPlan: {
    key: 'weeklyPlan',
    label: 'shortcuts.items.weeklyPlan',
    icon: CalendarCheckIcon,
    target: route('/rep/plans'),
    allowed: can(P.plans.readOwn),
  },
  newOrder: {
    key: 'newOrder',
    label: 'shortcuts.items.newOrder',
    icon: ShoppingCartIcon,
    target: route('/rep/orders/new'),
    allowed: can(P.orders.create),
  },
  orders: {
    key: 'orders',
    label: 'shortcuts.items.orders',
    icon: ReceiptTextIcon,
    target: route('/rep/orders'),
    allowed: (g) => hasPermission(g, P.orders.create) || hasPermission(g, P.orders.read),
  },
  newExpense: {
    key: 'newExpense',
    label: 'shortcuts.items.newExpense',
    icon: ClipboardPlusIcon,
    // Today's expenses card (with "Add") is on the day page of My visits.
    target: route('/rep/visits'),
    allowed: can(P.expenses.writeOwn),
  },
  expenses: {
    key: 'expenses',
    label: 'shortcuts.items.expenses',
    icon: WalletIcon,
    target: route('/rep/expenses'),
    allowed: can(P.expenses.readOwn),
  },
  newNote: {
    key: 'newNote',
    label: 'shortcuts.items.newNote',
    icon: NotebookPenIcon,
    target: action('newNote'),
    allowed: anyone,
  },
  notes: {
    key: 'notes',
    label: 'shortcuts.items.notes',
    icon: NotebookTextIcon,
    target: route('/rep/notes'),
    allowed: anyone,
    badge: 'dueReminders',
  },
  addDoctor: {
    key: 'addDoctor',
    label: 'shortcuts.items.addDoctor',
    icon: UserPlusIcon,
    target: route('/rep/doctors', { tab: 'doctors', add: true }),
    allowed: can(P.customers.create),
  },
  doctors: {
    key: 'doctors',
    label: 'shortcuts.items.doctors',
    icon: StethoscopeIcon,
    target: route('/rep/doctors'),
    allowed: can(P.customers.read),
  },
  pharmacies: {
    key: 'pharmacies',
    label: 'shortcuts.items.pharmacies',
    icon: PillIcon,
    target: route('/rep/doctors', { tab: 'pharmacies' }),
    allowed: can(P.customers.read),
  },
  addPharmacy: {
    key: 'addPharmacy',
    label: 'shortcuts.items.addPharmacy',
    icon: SquarePlusIcon,
    target: route('/rep/doctors', { tab: 'pharmacies', add: true }),
    allowed: can(P.customers.createPharmacy),
  },
  places: {
    key: 'places',
    label: 'shortcuts.items.places',
    icon: HospitalIcon,
    target: route('/rep/doctors', { tab: 'places' }),
    allowed: can(P.customers.read),
  },
  products: {
    key: 'products',
    label: 'shortcuts.items.products',
    icon: PackageIcon,
    // The catalog is a management screen; reps see products inside the order form.
    target: route('/admin/products'),
    allowed: (g) => hasPermission(g, P.products.read) && canUseDashboard(g),
  },
  notifications: {
    key: 'notifications',
    label: 'shortcuts.items.notifications',
    icon: BellIcon,
    target: route('/rep/notifications'),
    allowed: anyone,
    badge: 'unreadNotifications',
  },
  statistics: {
    key: 'statistics',
    label: 'shortcuts.items.statistics',
    icon: BarChart3Icon,
    target: route('/rep/statistics'),
    allowed: can(P.stats.read),
  },
  myVisits: {
    key: 'myVisits',
    label: 'shortcuts.items.myVisits',
    icon: ClipboardListIcon,
    target: route('/rep/visits'),
    allowed: can(P.visits.read),
  },
  account: {
    key: 'account',
    label: 'shortcuts.items.account',
    icon: UserRoundIcon,
    target: route('/rep/settings'),
    allowed: anyone,
  },
  trackingHealth: {
    key: 'trackingHealth',
    label: 'shortcuts.items.trackingHealth',
    icon: HeartPulseIcon,
    target: route('/rep/tracking-health'),
    allowed: tracksLocation,
  },
  management: {
    key: 'management',
    label: 'shortcuts.items.management',
    icon: LayoutDashboardIcon,
    target: route('/admin'),
    allowed: canUseDashboard,
  },
}

export function isShortcutKey(value: unknown): value is ShortcutKey {
  return typeof value === 'string' && (SHORTCUT_KEYS as readonly string[]).includes(value)
}

/** The same rule as the server: known keys only, each once, at most eight, in the given order. */
export function normalizeShortcutKeys(keys: readonly unknown[] | null | undefined): ShortcutKey[] {
  const out: ShortcutKey[] = []
  for (const key of keys ?? []) {
    if (isShortcutKey(key) && !out.includes(key)) out.push(key)
    if (out.length === MAX_SHORTCUTS) break
  }
  return out
}

/** Every shortcut this user may add, in catalog order. */
export function availableShortcuts(granted: Granted): ShortcutDef[] {
  return SHORTCUT_KEYS.map((key) => SHORTCUTS[key]).filter((def) => def.allowed(granted))
}

/** The saved (or default) keys as tiles: unknown keys and shortcuts the user may not use are left out. */
export function visibleShortcuts(keys: readonly unknown[], granted: Granted): ShortcutDef[] {
  return normalizeShortcutKeys(keys)
    .map((key) => SHORTCUTS[key])
    .filter((def) => def.allowed(granted))
}

const REP_DEFAULTS: ShortcutKey[] = [
  'startVisit',
  'todayPlan',
  'newOrder',
  'newExpense',
  'newNote',
  'doctors',
  'weeklyPlan',
  'notifications',
]
const MANAGER_DEFAULTS: ShortcutKey[] = [
  'management',
  'startVisit',
  'myVisits',
  'doctors',
  'newNote',
  'statistics',
  'weeklyPlan',
  'notifications',
]
const ADMIN_DEFAULTS: ShortcutKey[] = [
  'management',
  'notifications',
  'notes',
  'newNote',
  'statistics',
  'products',
  'doctors',
  'account',
]

const MANAGER_ROLES = ['SalesManager', 'AreaManager', 'Supervisor']

/**
 * The shortcuts shown until the user saves their own: by role (admin, the manager roles, everyone else as
 * a rep), keeping only those the user may use.
 */
export function defaultShortcutKeys(roleKeys: readonly string[], granted: Granted): ShortcutKey[] {
  const base = roleKeys.includes('Admin')
    ? ADMIN_DEFAULTS
    : roleKeys.some((key) => MANAGER_ROLES.includes(key))
      ? MANAGER_DEFAULTS
      : REP_DEFAULTS
  return visibleShortcuts(base, granted).map((def) => def.key)
}

/** Adds a shortcut at the end (no change when it is already there or the grid is full). */
export function addShortcut(keys: readonly ShortcutKey[], key: ShortcutKey): ShortcutKey[] {
  if (keys.includes(key) || keys.length >= MAX_SHORTCUTS) return [...keys]
  return [...keys, key]
}

export function removeShortcut(keys: readonly ShortcutKey[], key: ShortcutKey): ShortcutKey[] {
  return keys.filter((k) => k !== key)
}
