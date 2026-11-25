import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  addShortcut,
  availableShortcuts,
  defaultShortcutKeys,
  MAX_SHORTCUTS,
  normalizeShortcutKeys,
  removeShortcut,
  SHORTCUT_KEYS,
  SHORTCUTS,
  visibleShortcuts,
} from '../../src/features/home/shortcuts.ts'

const grants = (scope, ...keys) => Object.fromEntries(keys.map((k) => [k, scope]))

const rep = grants(
  'own',
  'visits:read',
  'visits:create',
  'tracking:report',
  'customers:read',
  'customers:create',
  'customers:create-pharmacy',
  'orders:create',
  'expenses:read-own',
  'expenses:write-own',
  'plans:read-own',
  'stats:read',
)
// A supervisor who also works in the field: team-wide reading plus their own visits.
const supervisor = {
  ...grants('team', 'users:read', 'visits:read', 'customers:read', 'stats:read', 'plans:read'),
  ...grants('own', 'visits:create', 'plans:read-own', 'customers:create'),
}
const admin = grants(
  'all',
  'users:read',
  'roles:read',
  'customers:read',
  'visits:read',
  'orders:read',
  'products:read',
  'stats:read',
  'settings:manage',
)
const keysOf = (defs) => defs.map((d) => d.key)

test('every key of the catalog has a definition, and the server holds the same keys', () => {
  assert.deepEqual(Object.keys(SHORTCUTS).toSorted(), [...SHORTCUT_KEYS].toSorted())
  for (const key of SHORTCUT_KEYS) assert.equal(SHORTCUTS[key].key, key)
  const server = readFileSync(
    new URL('../../../BACKEND/src/OriginalPharma.Application/Identity/HomeShortcuts.cs', import.meta.url),
    'utf8',
  )
  const block = server.slice(server.indexOf('Keys { get; } ='), server.indexOf('];'))
  assert.deepEqual(
    [...block.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]),
    [...SHORTCUT_KEYS],
  )
})

test('users only see shortcuts they have permission for', () => {
  const forRep = keysOf(availableShortcuts(rep))
  assert.ok(forRep.includes('startVisit'))
  assert.ok(forRep.includes('newOrder'))
  assert.ok(forRep.includes('addPharmacy'))
  assert.ok(forRep.includes('trackingHealth'))
  // Management screens need the dashboard; a rep has none.
  assert.ok(!forRep.includes('management'))
  assert.ok(!forRep.includes('products'))

  const nothing = keysOf(availableShortcuts({}))
  assert.deepEqual(nothing, ['newNote', 'notes', 'notifications', 'account'])

  const forAdmin = keysOf(availableShortcuts(admin))
  assert.ok(forAdmin.includes('management'))
  assert.ok(forAdmin.includes('products'))
  assert.ok(!forAdmin.includes('startVisit'))
  assert.ok(!forAdmin.includes('trackingHealth'))

  // Saved keys the user may no longer use are not shown.
  assert.deepEqual(keysOf(visibleShortcuts(['management', 'notes', 'startVisit'], rep)), [
    'notes',
    'startVisit',
  ])
})

test('defaults depend on the role and keep only what the user may use', () => {
  assert.deepEqual(defaultShortcutKeys(['Rep'], rep), [
    'startVisit',
    'todayPlan',
    'newOrder',
    'newExpense',
    'newNote',
    'doctors',
    'weeklyPlan',
    'notifications',
  ])
  assert.deepEqual(defaultShortcutKeys(['Supervisor'], supervisor), [
    'management',
    'startVisit',
    'myVisits',
    'doctors',
    'newNote',
    'statistics',
    'weeklyPlan',
    'notifications',
  ])
  assert.deepEqual(defaultShortcutKeys(['Admin'], admin), [
    'management',
    'notifications',
    'notes',
    'newNote',
    'statistics',
    'products',
    'doctors',
    'account',
  ])
  // A custom role gets the rep set, filtered by its grants.
  assert.deepEqual(defaultShortcutKeys(['Merchandiser'], grants('own', 'customers:read')), [
    'newNote',
    'doctors',
    'notifications',
  ])
  for (const role of ['Rep', 'Supervisor', 'Admin'])
    assert.ok(defaultShortcutKeys([role], { ...rep, ...supervisor, ...admin }).length <= MAX_SHORTCUTS)
})

test('keys are known, unique, at most eight and in order', () => {
  assert.deepEqual(normalizeShortcutKeys(['notes', 'leaderboard', 'notes', 42, 'startVisit']), [
    'notes',
    'startVisit',
  ])
  assert.deepEqual(normalizeShortcutKeys(null), [])
  assert.equal(normalizeShortcutKeys(SHORTCUT_KEYS).length, MAX_SHORTCUTS)
  assert.deepEqual(normalizeShortcutKeys(SHORTCUT_KEYS), SHORTCUT_KEYS.slice(0, MAX_SHORTCUTS))
})

test('adding goes to the end, never twice and never past eight; removing keeps the order', () => {
  assert.deepEqual(addShortcut(['notes'], 'startVisit'), ['notes', 'startVisit'])
  assert.deepEqual(addShortcut(['notes'], 'notes'), ['notes'])
  const full = SHORTCUT_KEYS.slice(0, MAX_SHORTCUTS)
  assert.deepEqual(addShortcut(full, 'management'), full)
  assert.deepEqual(removeShortcut(['notes', 'startVisit', 'orders'], 'startVisit'), ['notes', 'orders'])
})

test('shortcuts that open a tab or a sheet of the customer screen say so', () => {
  assert.deepEqual(SHORTCUTS.addDoctor.target, {
    kind: 'route',
    to: '/rep/doctors',
    search: { tab: 'doctors', add: true },
  })
  assert.deepEqual(SHORTCUTS.pharmacies.target, {
    kind: 'route',
    to: '/rep/doctors',
    search: { tab: 'pharmacies' },
  })
  assert.equal(SHORTCUTS.startVisit.target.kind, 'action')
  assert.equal(SHORTCUTS.notifications.badge, 'unreadNotifications')
  assert.equal(SHORTCUTS.notes.badge, 'dueReminders')
})
