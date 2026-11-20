import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canAcknowledge,
  defaultDays,
  eventTarget,
  groupByRepAndDay,
  isDay,
  isReasonCode,
  localDay,
  rangeOf,
} from '../../src/features/suspicious/suspicious-logic.ts'

/** Local wall-clock time, so the tests pass in any time zone. */
const at = (day, hour, minute = 0) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute).toISOString()
}

const event = (over) => ({
  id: crypto.randomUUID(),
  userId: 'rep-a',
  userName: 'Ahmed',
  type: 'mockLocation',
  status: 'open',
  score: 60,
  signals: ['mock-location'],
  details: null,
  createdAt: at('2026-11-19', 10),
  lastSeenAt: null,
  occurrences: 1,
  locationPointId: null,
  lat: null,
  lng: null,
  pointRecordedAt: null,
  visitId: null,
  customerName: null,
  customerNameAr: null,
  reviewNote: null,
  reviewedAt: null,
  reviewedByName: null,
  ...over,
})

test('events are listed per rep and per local day, newest day first', () => {
  const groups = groupByRepAndDay([
    event({ createdAt: at('2026-11-18', 23, 30) }),
    event({ createdAt: at('2026-11-19', 8), signals: ['teleport'], type: 'anomaly', score: 50 }),
    event({ createdAt: at('2026-11-19', 9), userId: 'rep-b', userName: 'Basma', status: 'acknowledged' }),
    event({ createdAt: at('2026-11-19', 11), occurrences: 4, lastSeenAt: at('2026-11-19', 15) }),
  ])

  assert.deepEqual(
    groups.map((g) => [g.day, g.userName, g.events.length]),
    [
      ['2026-11-19', 'Ahmed', 2],
      ['2026-11-19', 'Basma', 1],
      ['2026-11-18', 'Ahmed', 1],
    ],
  )
  const today = groups[0]
  assert.equal(today.open, 2)
  assert.equal(today.occurrences, 5)
  assert.equal(today.maxScore, 60)
  assert.equal(today.lastAt, at('2026-11-19', 15))
  assert.deepEqual(today.reasons.toSorted(), ['mock-location', 'teleport'])
  // Newest event first inside the day.
  assert.equal(today.events[0].createdAt, at('2026-11-19', 11))
})

test('on the same day, reps with open events come first', () => {
  const groups = groupByRepAndDay([
    event({ userId: 'z', userName: 'Zeinab', status: 'open' }),
    event({ userId: 'a', userName: 'Amr', status: 'acknowledged' }),
  ])
  assert.deepEqual(
    groups.map((g) => g.userName),
    ['Zeinab', 'Amr'],
  )
})

test('the evidence link opens the visit, or the route of that day at the point', () => {
  assert.deepEqual(eventTarget(event({ visitId: 'v1' })), { kind: 'visit', visitId: 'v1' })
  const pointAt = at('2026-11-17', 14, 5)
  assert.deepEqual(eventTarget(event({ pointRecordedAt: pointAt })), {
    kind: 'map',
    userId: 'rep-a',
    day: '2026-11-17',
    at: pointAt,
  })
  assert.deepEqual(eventTarget(event({})), { kind: 'map', userId: 'rep-a', day: '2026-11-19', at: null })
})

test('only open or acknowledged events can be acknowledged', () => {
  assert.equal(canAcknowledge({ status: 'open' }), true)
  assert.equal(canAcknowledge({ status: 'acknowledged' }), true)
  assert.equal(canAcknowledge({ status: 'confirmed' }), false)
  assert.equal(canAcknowledge({ status: 'dismissed' }), false)
})

test('the period covers whole local days, in either order', () => {
  const range = rangeOf('2026-11-13', '2026-11-19')
  assert.equal(range.from, new Date(2026, 10, 13).toISOString())
  assert.equal(range.to, new Date(2026, 10, 20).toISOString())
  assert.deepEqual(rangeOf('2026-11-19', '2026-11-13'), range)
  assert.deepEqual(defaultDays(new Date(2026, 10, 19, 16)), { from: '2026-11-13', to: '2026-11-19' })
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

test('URL values are checked before use', () => {
  assert.equal(isDay('2026-11-19'), true)
  assert.equal(isDay('19/11/2026'), false)
  assert.equal(isReasonCode('mock-location'), true)
  assert.equal(isReasonCode('drop table'), false)
})
