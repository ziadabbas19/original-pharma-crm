import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyQueued,
  applyQueuedToMonth,
  isPermanentRefusal,
  parseAmount,
  sumAmounts,
} from '../../src/features/expenses/expense-queue.ts'

const line = (id, cityId, amount, extra = {}) => ({
  id,
  userId: 'rep',
  userName: 'Rep',
  day: '2026-11-21',
  cityId,
  cityName: cityId,
  cityNameAr: null,
  amount,
  originalAmount: amount,
  kind: 'auto',
  note: null,
  createdAt: '2026-11-21T08:00:00Z',
  updatedAt: null,
  updatedByName: null,
  ...extra,
})

const day = {
  userId: 'rep',
  userName: 'Rep',
  day: '2026-11-21',
  lines: [line('a', 'tanta', 60), line('b', 'santa', 45.5)],
  total: 105.5,
  note: null,
  managerNote: null,
  managerNoteByName: null,
  monthTotal: 500.1,
  canEdit: true,
  canEditNote: true,
  canManage: false,
  editableFrom: '2026-10-07',
  today: '2026-11-21',
}

const at = '2026-11-21T09:00:00Z'

test('amounts add up in piasters and typed amounts are read like people type them', () => {
  assert.equal(sumAmounts([0.1, 0.2]), 0.3)
  assert.equal(sumAmounts([60, 45.5, 33.33]), 138.83)
  assert.equal(parseAmount('12.5'), 12.5)
  assert.equal(parseAmount('12,50'), 12.5)
  assert.equal(parseAmount('١٢٫٥'), 12.5) // Arabic-Indic digits and decimal sign
  assert.equal(parseAmount('0'), 0)
  assert.equal(parseAmount('12.345'), null)
  assert.equal(parseAmount('-5'), null)
  assert.equal(parseAmount(''), null)
})

test('an edit made on the phone shows at once, keeps the default and marks the line edited', () => {
  const view = applyQueued(day, [
    {
      type: 'update',
      lineId: 'a',
      userId: 'rep',
      day: '2026-11-21',
      amount: 90,
      note: 'Taxi',
      changedAt: at,
    },
  ])
  const edited = view.lines.find((l) => l.id === 'a')
  assert.equal(edited.amount, 90)
  assert.equal(edited.originalAmount, 60)
  assert.equal(edited.kind, 'edited')
  assert.equal(edited.note, 'Taxi')
  assert.equal(edited.queued, true)
  assert.equal(view.total, 135.5)
  assert.equal(view.monthTotal, 530.1)
  assert.equal(view.queued, 1)
})

test('setting an edited amount back to the default is no longer an edit', () => {
  const view = applyQueued(day, [
    { type: 'update', lineId: 'a', userId: 'rep', day: '2026-11-21', amount: 60, changedAt: at },
  ])
  assert.equal(view.lines[0].kind, 'auto')
})

test('lines added and removed offline, and the day note, are shown; other days and reps are not touched', () => {
  const view = applyQueued(day, [
    {
      type: 'create',
      lineId: 'c',
      userId: 'rep',
      day: '2026-11-21',
      cityId: 'basyoun',
      cityName: 'Basyoun',
      cityNameAr: null,
      amount: 30,
      note: null,
      changedAt: at,
    },
    { type: 'remove', lineId: 'b', userId: 'rep', day: '2026-11-21', changedAt: at },
    { type: 'dayNote', userId: 'rep', day: '2026-11-21', note: 'Two towns today', changedAt: at },
    { type: 'remove', lineId: 'a', userId: 'rep', day: '2026-11-20', changedAt: at },
    { type: 'remove', lineId: 'a', userId: 'someone-else', day: '2026-11-21', changedAt: at },
  ])
  assert.deepEqual(
    view.lines.map((l) => l.id),
    ['a', 'c'],
  )
  assert.equal(view.lines[1].kind, 'manual')
  assert.equal(view.total, 90)
  assert.equal(view.note, 'Two towns today')
  assert.equal(view.monthTotal, 484.6)
})

test('the month total and its breakdown follow a change on any of its days', () => {
  const month = {
    userId: 'rep',
    userName: 'Rep',
    month: '2026-11',
    from: '2026-11-01',
    to: '2026-11-30',
    total: 165.5,
    daysWithExpenses: 2,
    byCity: [],
    byDay: [],
    days: [
      {
        day: '2026-11-03',
        lines: [line('x', 'tanta', 60, { day: '2026-11-03' })],
        total: 60,
        note: null,
        managerNote: null,
      },
      { day: '2026-11-21', lines: day.lines, total: 105.5, note: null, managerNote: null },
    ],
  }
  const changed = applyQueuedToMonth(month, [
    { type: 'update', lineId: 'b', userId: 'rep', day: '2026-11-21', amount: 50, changedAt: at },
    { type: 'dayNote', userId: 'rep', day: '2026-11-25', note: 'Office', changedAt: at },
    { type: 'remove', lineId: 'zz', userId: 'rep', day: '2026-12-01', changedAt: at },
  ])
  assert.equal(changed.total, 170)
  assert.equal(changed.daysWithExpenses, 2)
  assert.equal(sumAmounts(changed.byCity.map((c) => c.total)), changed.total)
  assert.deepEqual(
    changed.byCity.map((c) => [c.cityId, c.total, c.days]),
    [
      ['tanta', 120, 2],
      ['santa', 50, 1],
    ],
  )
  assert.deepEqual(
    changed.byDay.map((d) => [d.day, d.total, d.hasNote, d.hasEdited]),
    [
      ['2026-11-03', 60, false, false],
      ['2026-11-21', 110, false, true],
      ['2026-11-25', 0, true, false],
    ],
  )
  // Nothing queued for the month: the server's copy as it is.
  assert.equal(applyQueuedToMonth(month, []), month)
})

test('only refusals that will not change are dropped from the queue', () => {
  assert.equal(isPermanentRefusal(422), true)
  assert.equal(isPermanentRefusal(403), true)
  assert.equal(isPermanentRefusal(409), true)
  for (const status of [401, 408, 429, 500, 503]) assert.equal(isPermanentRefusal(status), false)
})
