import assert from 'node:assert/strict'
import { test } from 'node:test'
import { positionVisible, liveStatusLabelKey, liveStatusOf } from '../../src/features/tracking/live-status.ts'
import { shouldCollect, toCollectionMode } from '../../src/features/tracking/collection-rules.ts'
import { eventTarget } from '../../src/features/suspicious/suspicious-logic.ts'

const NOW = Date.parse('2026-11-20T10:00:00Z')
const position = { lat: 30, lng: 31, recordedAt: '2026-11-20T09:59:00Z' }
const visitOnly = { mode: 'visitOnly', bufferMinutes: 5 }
const allDay = { mode: 'allDay', bufferMinutes: 5 }

test('in visit-only mode a position shows during a visit and for the buffer after it', () => {
  assert.equal(positionVisible({ position, onVisit: true }, NOW, visitOnly), true)
  assert.equal(
    positionVisible({ position, onVisit: false, visitEndedAt: '2026-11-20T09:57:00Z' }, NOW, visitOnly),
    true,
  )
  assert.equal(
    positionVisible({ position, onVisit: false, visitEndedAt: '2026-11-20T09:54:00Z' }, NOW, visitOnly),
    false,
  )
  assert.equal(
    positionVisible({ position, onVisit: false, visibleUntil: '2026-11-20T10:01:00Z' }, NOW, visitOnly),
    true,
  )
  assert.equal(
    positionVisible({ position, onVisit: false, visibleUntil: '2026-11-20T09:59:59Z' }, NOW, visitOnly),
    false,
  )
  assert.equal(positionVisible({ position, onVisit: false }, NOW, visitOnly), false)
})

test('all-day mode and an unknown mode show every position; no position shows nothing', () => {
  assert.equal(positionVisible({ position, onVisit: false }, NOW, allDay), true)
  assert.equal(positionVisible({ position, onVisit: false }, NOW, undefined), true)
  assert.equal(positionVisible({ position: null, onVisit: true }, NOW, visitOnly), false)
})

test('a rep between visits is "not on a visit", and online reads "on a visit" in visit-only mode', () => {
  assert.equal(liveStatusOf({ status: 'notOnVisit', lastSeenAt: null }, NOW), 'notOnVisit')
  assert.equal(liveStatusLabelKey('online', true), 'liveMap.status.onVisit')
  assert.equal(liveStatusLabelKey('online', false), 'liveMap.status.online')
  assert.equal(liveStatusLabelKey('notOnVisit', true), 'liveMap.status.notOnVisit')
})

test('the phone collects only while a visit is open in visit-only mode, all day otherwise', () => {
  assert.equal(shouldCollect({ mode: 'visitOnly', dayRunning: true, visitInProgress: false }), false)
  assert.equal(shouldCollect({ mode: 'visitOnly', dayRunning: true, visitInProgress: true }), true)
  assert.equal(shouldCollect({ mode: 'allDay', dayRunning: true, visitInProgress: false }), true)
  assert.equal(shouldCollect({ mode: 'allDay', dayRunning: false, visitInProgress: false }), false)
  assert.equal(shouldCollect({ mode: 'visitOnly', dayRunning: false, visitInProgress: true }), false)
  assert.equal(toCollectionMode('visitOnly'), 'visitOnly')
  assert.equal(toCollectionMode(undefined), null)
  assert.equal(toCollectionMode('everywhere'), null)
})

test('a review event recorded outside a visit has no map link', () => {
  const base = { userId: 'u', createdAt: '2026-11-20T09:00:00Z', pointRecordedAt: '2026-11-20T08:59:00Z' }
  assert.deepEqual(eventTarget({ ...base, locationHidden: true }), { kind: 'hidden' })
  assert.equal(eventTarget({ ...base, locationHidden: false }).kind, 'map')
  assert.deepEqual(eventTarget({ ...base, visitId: 'v', locationHidden: true }), {
    kind: 'visit',
    visitId: 'v',
  })
})
