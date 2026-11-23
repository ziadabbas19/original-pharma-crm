import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addHours,
  groupByWeekday,
  matchingSlots,
  rangesOverlap,
  slotMatches,
  slotProblems,
  toMinutes,
  toSlotInputs,
  weekdayRange,
} from '../../src/features/doctors/availability.ts'
import { amProgress, todayPlan } from '../../src/features/home/today-plan.ts'
import { applyOrder, moveId } from '../../src/features/home/reorder.ts'

const slot = (weekday, start, end, place = '') => ({ weekday, start, end, place })

test('times are read as minutes after midnight; anything else is not a time', () => {
  assert.equal(toMinutes('00:00'), 0)
  assert.equal(toMinutes('9:30'), 570)
  assert.equal(toMinutes('23:59'), 1439)
  assert.equal(toMinutes('24:00'), null)
  assert.equal(toMinutes('6pm'), null)
  assert.equal(toMinutes(''), null)
})

test('two ranges overlap when they share time; touching ends do not', () => {
  assert.equal(rangesOverlap(600, 780, 720, 1080), true) // 10:00-13:00 and 12:00-18:00
  assert.equal(rangesOverlap(600, 780, 780, 1020), false) // ends at 13:00, the other starts at 13:00
  assert.equal(rangesOverlap(1020, 1260, 600, 1020), false)
  assert.equal(rangesOverlap(600, 1260, 720, 780), true) // one inside the other
})

test('the search matches a slot on the weekday that overlaps the range, either end open', () => {
  const evening = slot('saturday', '17:00', '21:00')
  assert.equal(slotMatches(evening, { weekday: 'saturday', from: '18:00', to: '22:00' }), true)
  assert.equal(slotMatches(evening, { weekday: 'saturday', from: '13:00', to: '17:00' }), false)
  assert.equal(slotMatches(evening, { weekday: 'sunday' }), false)
  assert.equal(slotMatches(evening, { from: '20:59' }), true)
  assert.equal(slotMatches(evening, { from: '21:00' }), false)
  assert.equal(slotMatches(evening, { to: '17:01' }), true)
  assert.equal(slotMatches(evening, {}), true)
  const slots = [
    slot('monday', '10:00', '12:00'),
    slot('saturday', '17:00', '21:00'),
    slot('saturday', '09:00', '11:00'),
  ]
  assert.deepEqual(
    matchingSlots(slots, { from: '10:30', to: '18:00' }).map((s) => `${s.weekday} ${s.start}`),
    ['saturday 09:00', 'saturday 17:00', 'monday 10:00'],
  )
})

test('slots group by weekday, Saturday first, then by start time', () => {
  const groups = groupByWeekday([
    slot('friday', '10:00', '11:00'),
    slot('saturday', '17:00', '21:00'),
    slot('saturday', '09:00', '11:00'),
    slot('sunday', '18:00', '20:00'),
  ])
  assert.deepEqual(
    groups.map((g) => [g.weekday, g.slots.map((s) => s.start)]),
    [
      ['saturday', ['09:00', '17:00']],
      ['sunday', ['18:00']],
      ['friday', ['10:00']],
    ],
  )
})

test('the form flags bad times, an end before the start and overlaps on the same day', () => {
  assert.deepEqual(
    slotProblems([
      slot('saturday', '17:00', '21:00'),
      slot('saturday', '20:30', '21:00'),
      slot('saturday', '21:00', '22:00'),
      slot('sunday', '20:30', '22:00'),
      slot('monday', '18:00', '18:00'),
      slot('monday', '7pm', '9pm'),
    ]),
    [null, 'overlap', null, null, 'endBeforeStart', 'time'],
  )
  assert.deepEqual(toSlotInputs([slot('monday', '9:00', '12:00', '  Clinic ')]), [
    { weekday: 'monday', start: '09:00', end: '12:00', place: 'Clinic' },
  ])
})

test('a day range follows the Egyptian week and may wrap over Friday', () => {
  assert.deepEqual(weekdayRange('saturday', 'wednesday'), [
    'saturday',
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
  ])
  assert.deepEqual(weekdayRange('thursday', 'sunday'), ['thursday', 'friday', 'saturday', 'sunday'])
  assert.deepEqual(weekdayRange('monday', 'monday'), ['monday'])
  assert.equal(weekdayRange('sunday', 'saturday').length, 7)
})

test('the same hours are added to every chosen day, Saturday first', () => {
  const evening = { start: '17:00', end: '21:00', place: 'Clinic' }
  const existing = [slot('monday', '09:00', '12:00')]
  const result = addHours(existing, weekdayRange('thursday', 'sunday'), evening)
  assert.equal(result.problem, null)
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(
    result.slots.map((s) => `${s.weekday} ${s.start}-${s.end} ${s.place}`),
    [
      'saturday 17:00-21:00 Clinic',
      'sunday 17:00-21:00 Clinic',
      'monday 09:00-12:00 ',
      'thursday 17:00-21:00 Clinic',
      'friday 17:00-21:00 Clinic',
    ],
  )
  // A single day, chosen alone, with its own hours.
  assert.deepEqual(addHours([], ['tuesday'], { start: '10:00', end: '13:00', place: '' }).slots, [
    slot('tuesday', '10:00', '13:00'),
  ])
  // Days that already have hours afterwards (a touching end is not an overlap).
  assert.equal(addHours(existing, ['monday'], { start: '12:00', end: '15:00', place: '' }).slots.length, 2)
})

test('nothing is added when the hours overlap a chosen day or the times are wrong', () => {
  const existing = [slot('sunday', '18:00', '20:00'), slot('tuesday', '09:00', '10:00')]
  const evening = { start: '17:00', end: '21:00', place: '' }
  const clash = addHours(existing, ['saturday', 'tuesday', 'sunday'], evening)
  assert.equal(clash.problem, 'overlap')
  assert.deepEqual(clash.conflicts, ['sunday'])
  assert.deepEqual(clash.slots, existing)

  const backwards = addHours(existing, ['saturday'], { start: '21:00', end: '17:00', place: '' })
  assert.equal(backwards.problem, 'endBeforeStart')
  assert.deepEqual(backwards.slots, existing)
  assert.equal(addHours([], ['saturday'], { start: '', end: '21:00', place: '' }).problem, 'time')
})

test('drag and drop moves one item to where another one was', () => {
  assert.deepEqual(moveId(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveId(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c'])
  assert.deepEqual(moveId(['a', 'b'], 'a', 'x'), ['a', 'b'])
})

test('the saved order is applied and items it does not name go to the end', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  const ids = (list) => list.map((x) => x.id)
  assert.deepEqual(ids(applyOrder(items, ['c', 'a'], (x) => x.id)), ['c', 'a', 'b', 'd'])
  assert.deepEqual(ids(applyOrder(items, ['gone', 'd'], (x) => x.id)), ['d', 'a', 'b', 'c'])
  assert.deepEqual(ids(applyOrder(items, [], (x) => x.id)), ['a', 'b', 'c', 'd'])
  assert.deepEqual(ids(applyOrder(items, null, (x) => x.id)), ['a', 'b', 'c', 'd'])
})

const doctor = (id, name, townId) => ({ id, type: 'doctor', name, townId })

test("Home lists the doctors of today's town in the rep's order; AM visits stay out of the target", () => {
  const customers = [
    doctor('a', 'Dr. Adel', 'tanta'),
    doctor('b', 'Dr. Basma', 'tanta'),
    doctor('c', 'Dr. Camilia', 'tanta'),
    doctor('z', 'Dr. Zaki', 'kafr'),
    { id: 'h', type: 'hospital', name: 'Kafr El-Zayat General Hospital', townId: 'kafr' },
  ]
  const visits = [
    {
      id: 'v1',
      customerId: 'h',
      customerName: 'Hospital',
      status: 'completed',
      checkInAt: '2026-11-23T07:00:00Z',
      customerType: 'hospital',
    },
    {
      id: 'v2',
      customerId: 'b',
      customerName: 'Dr. Basma',
      status: 'completed',
      checkInAt: '2026-11-23T15:00:00Z',
      customerType: 'doctor',
    },
  ]
  const plan = todayPlan({
    customers,
    visits,
    townIds: ['tanta'],
    order: ['c', 'z', 'a'],
    waitingLimit: Infinity,
  })
  assert.deepEqual(
    plan.items.map((i) => [i.kind, i.customerId]),
    [
      ['waiting', 'c'],
      ['waiting', 'a'],
      ['done', 'b'],
    ],
  )
  assert.equal(plan.done, 1) // the AM visit is not counted
  assert.equal(plan.next.id, 'c')

  // The whole area: every doctor, the new one ('z' is named in the order) included.
  assert.deepEqual(
    todayPlan({ customers, visits: [], order: ['c'], waitingLimit: Infinity }).items.map((i) => i.customerId),
    ['c', 'a', 'b', 'z'],
  )

  // An AM visit in progress does not show among the doctors, but a visit is running.
  const running = todayPlan({ customers, visits: [], activeCustomerId: 'h', townIds: ['tanta'] })
  assert.equal(running.inProgress, true)
  assert.deepEqual(
    running.items.map((i) => i.kind),
    ['waiting', 'waiting', 'waiting'],
  )
})

test('the AM list counts its own visits, wherever the places are', () => {
  const visits = [
    {
      id: 'v1',
      customerId: 'h1',
      customerName: 'Fevers Hospital',
      status: 'completed',
      checkInAt: '2026-11-23T07:00:00Z',
    },
    {
      id: 'v2',
      customerId: 'd1',
      customerName: 'Dr. Adel',
      status: 'completed',
      checkInAt: '2026-11-23T15:00:00Z',
    },
  ]
  assert.deepEqual(amProgress({ placeIds: ['h1', 'h2', 'h3'], visits, activeCustomerId: 'h2' }), {
    done: 1,
    total: 3,
    status: { h1: 'done', h2: 'inProgress', h3: 'waiting' },
  })
  assert.deepEqual(amProgress({ placeIds: [], visits }), { done: 0, total: 0, status: {} })
})
