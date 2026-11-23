import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addWeeks, egyptDayOf, SATURDAY, weekDays, weekdayOf, weekStartOf } from '../../src/lib/egypt-day.ts'
import {
  barPercent,
  dayState,
  isWeekOver,
  percentOf,
  showsActuals,
  weekSummary,
} from '../../src/features/plans/plan-progress.ts'
import {
  parseTarget,
  planCacheKey,
  toInputs,
  withDay,
  withoutDay,
} from '../../src/features/plans/plan-input.ts'

test('weeks start on Saturday by default, or on the configured day', () => {
  assert.equal(weekdayOf('2027-02-06'), SATURDAY)
  assert.equal(weekStartOf('2027-02-06'), '2027-02-06')
  assert.equal(weekStartOf('2027-02-12'), '2027-02-06') // Friday ends the week
  assert.equal(weekStartOf('2027-02-13'), '2027-02-13')
  assert.equal(weekStartOf('2027-01-01'), '2026-12-26') // across a year
  assert.equal(weekStartOf('2027-02-06', 0), '2027-01-31') // weeks starting on Sunday
  assert.equal(weekStartOf('2027-02-08', 1), '2027-02-08') // and on Monday
  assert.deepEqual(weekDays('2027-02-06'), [
    '2027-02-06',
    '2027-02-07',
    '2027-02-08',
    '2027-02-09',
    '2027-02-10',
    '2027-02-11',
    '2027-02-12',
  ])
  assert.equal(addWeeks('2027-02-06', 1), '2027-02-13')
  assert.equal(addWeeks('2027-01-02', -1), '2026-12-26')
})

test('the week turns over at Egypt midnight, not UTC midnight', () => {
  // Friday 23:59:59 in Cairo (21:59:59Z in winter) is still last week; a second later is the new one.
  assert.equal(weekStartOf(egyptDayOf('2027-02-12T21:59:59Z')), '2027-02-06')
  assert.equal(weekStartOf(egyptDayOf('2027-02-12T22:00:00Z')), '2027-02-13')
  // Summer time (UTC+3): midnight in Cairo is 21:00Z.
  assert.equal(weekStartOf(egyptDayOf('2026-07-10T20:59:59Z')), '2026-07-04')
  assert.equal(weekStartOf(egyptDayOf('2026-07-10T21:00:00Z')), '2026-07-11')
})

test('percentages round half up and stop at 100, as on the server', () => {
  assert.equal(percentOf(0, 0), 0)
  assert.equal(percentOf(3, 0), 0)
  assert.equal(percentOf(1, 8), 13) // 12.5
  assert.equal(percentOf(1, 200), 1) // 0.5
  assert.equal(percentOf(5, 10), 50)
  assert.equal(percentOf(12, 10), 100)
  assert.equal(barPercent(0, 0), 0)
  assert.equal(barPercent(2, 0), 100)
  assert.equal(barPercent(3, 4), 75)
})

test('each day reads as off, upcoming, under way, met or short', () => {
  const today = '2027-02-10'
  assert.equal(dayState('2027-02-09', today, false, 3, 0), 'off')
  assert.equal(dayState('2027-02-11', today, true, 0, 4), 'upcoming')
  assert.equal(dayState(today, today, true, 2, 4), 'today')
  assert.equal(dayState(today, today, true, 4, 4), 'met')
  assert.equal(dayState('2027-02-09', today, true, 5, 4), 'met')
  assert.equal(dayState('2027-02-09', today, true, 1, 4), 'short')
  assert.equal(dayState('2027-02-09', today, true, 0, 0), 'met')

  assert.equal(showsActuals('2027-02-11', today, undefined), false)
  assert.equal(showsActuals(today, today, undefined), true)
  assert.equal(
    showsActuals('2027-02-11', today, {
      day: '2027-02-11',
      target: 2,
      done: 0,
      unplanned: 1,
      plannedCustomers: 0,
      plannedCustomersVisited: 0,
    }),
    true,
  )
  assert.equal(isWeekOver('2027-02-06', '2027-02-12'), false)
  assert.equal(isWeekOver('2027-02-06', '2027-02-13'), true)
})

test('the week summary adds the days like the server', () => {
  const day = (d, target, done, unplanned = 0) => ({
    day: d,
    target,
    done,
    unplanned,
    plannedCustomers: 0,
    plannedCustomersVisited: 0,
  })
  const days = [
    day('2027-02-06', 3, 2, 1),
    day('2027-02-07', 2, 0),
    day('2027-02-08', 5, 5),
    day('2027-02-09', 0, 0),
    day('2027-02-10', 0, 0, 1),
    day('2027-02-11', 0, 0),
    day('2027-02-12', 0, 0),
  ]
  const planned = new Set(['2027-02-06', '2027-02-07', '2027-02-08'])
  assert.deepEqual(weekSummary(days, planned, '2027-02-10'), {
    planned: 10,
    done: 7,
    unplanned: 2,
    percent: 70,
    daysPlanned: 3,
    daysMet: 1,
  })
})

test('a day edit replaces that day only and keeps the week in order', () => {
  const plan = {
    days: [
      {
        day: '2027-02-08',
        cityId: 'c2',
        targetVisits: 4,
        note: null,
        customers: [],
        amPlaces: [{ customerId: 'h1' }],
      },
      {
        day: '2027-02-06',
        cityId: 'c1',
        targetVisits: 3,
        note: 'Clinics first',
        customers: [{ customerId: 'd1' }, { customerId: 'p1' }],
      },
    ],
  }
  const inputs = toInputs(plan)
  assert.deepEqual(inputs[1], {
    day: '2027-02-06',
    cityId: 'c1',
    targetVisits: 3,
    note: 'Clinics first',
    customerIds: ['d1', 'p1'],
    amPlaceIds: [],
  })
  // Another day's AM places travel with the week, so editing one day never drops them.
  assert.deepEqual(inputs[0].amPlaceIds, ['h1'])
  const edited = withDay(inputs, { day: '2027-02-07', cityId: 'c1', targetVisits: 6, customerIds: [] })
  assert.deepEqual(
    edited.map((d) => d.day),
    ['2027-02-06', '2027-02-07', '2027-02-08'],
  )
  assert.equal(withDay(edited, { ...edited[0], targetVisits: 9 })[0].targetVisits, 9)
  assert.deepEqual(
    withoutDay(edited, '2027-02-07').map((d) => d.day),
    ['2027-02-06', '2027-02-08'],
  )
  assert.equal(planCacheKey(undefined), 'plan-mine-current')
  assert.equal(planCacheKey('2027-02-06'), 'plan-mine-2027-02-06')
})

test('targets are whole numbers from 0 to 100', () => {
  assert.equal(parseTarget('0'), 0)
  assert.equal(parseTarget(' 12 '), 12)
  assert.equal(parseTarget('100'), 100)
  assert.equal(parseTarget('101'), null)
  assert.equal(parseTarget('-1'), null)
  assert.equal(parseTarget('2.5'), null)
  assert.equal(parseTarget(''), null)
  assert.equal(parseTarget('abc'), null)
})
