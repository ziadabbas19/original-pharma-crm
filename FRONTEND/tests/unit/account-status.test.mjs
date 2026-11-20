import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountStatus } from '../../src/features/tracking/account-status.ts'

test('before the first health check both rows say it is checking', () => {
  assert.deepEqual(accountStatus([], false), { location: 'unknown', notifications: 'unknown' })
})

test('a healthy phone shows both rows as ready', () => {
  assert.deepEqual(accountStatus([], true), { location: 'ok', notifications: 'ok' })
})

test('location and notification problems turn their own row amber only', () => {
  assert.deepEqual(accountStatus(['background-location-missing'], true), {
    location: 'attention',
    notifications: 'ok',
  })
  assert.deepEqual(accountStatus(['notifications-denied', 'battery-optimization-on'], true), {
    location: 'ok',
    notifications: 'attention',
  })
})
