import assert from 'node:assert/strict'
import { test } from 'node:test'
import { phoneTabs, allowedNav } from '../../src/components/layout/admin-nav.ts'
import { canUseDashboard, canUseFieldApp, tracksLocation } from '../../src/lib/permissions.ts'

const grants = (scope, ...keys) => Object.fromEntries(keys.map((k) => [k, scope]))

const rep = grants(
  'own',
  'visits:read',
  'visits:create',
  'tracking:report',
  'customers:read',
  'customers:create',
  'orders:create',
  'stats:read',
)
const supervisor = grants(
  'team',
  'users:read',
  'visits:read',
  'tracking:view-live',
  'tracking:review-suspicious',
  'customers:read',
  'orders:read',
  'stats:read',
)
// The admin role holds every permission at scope "all", tracking:report included.
const admin = grants(
  'all',
  'users:read',
  'roles:read',
  'visits:read',
  'visits:create',
  'tracking:report',
  'tracking:view-live',
  'orders:read',
  'settings:manage',
  'audit:read',
)

test('only own-scope field grants make someone track and use the rep app', () => {
  assert.equal(tracksLocation(rep), true)
  assert.equal(canUseFieldApp(rep), true)
  assert.equal(canUseDashboard(rep), false)

  assert.equal(tracksLocation(admin), false)
  assert.equal(canUseFieldApp(admin), false)
  assert.equal(canUseDashboard(admin), true)

  assert.equal(tracksLocation(supervisor), false)
  assert.equal(canUseDashboard(supervisor), true)
})

test('a manager who also works in the field has both', () => {
  const both = { ...supervisor, 'tracking:report': 'own', 'visits:create': 'own' }
  assert.equal(tracksLocation(both), true)
  assert.equal(canUseFieldApp(both), true)
  assert.equal(canUseDashboard(both), true)
})

test('the phone bar shows the four most used pages the role may open', () => {
  assert.deepEqual(
    phoneTabs(supervisor).map((t) => t.to),
    ['/admin', '/admin/live-map', '/admin/visits', '/admin/orders'],
  )
  const noMap = { ...supervisor }
  delete noMap['tracking:view-live']
  assert.deepEqual(
    phoneTabs(noMap).map((t) => t.to),
    ['/admin', '/admin/visits', '/admin/orders', '/admin/doctors'],
  )
})

test('pages the role may not open are not offered', () => {
  const paths = allowedNav(supervisor).flatMap((s) => s.items.map((i) => i.to))
  for (const hidden of ['/admin/roles', '/admin/settings', '/admin/activity', '/admin/lookups']) {
    assert.ok(!paths.includes(hidden), hidden)
  }
  assert.ok(paths.includes('/admin/suspicious-activity'))
})
