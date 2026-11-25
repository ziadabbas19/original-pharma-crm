import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_SCHEDULED,
  REMINDER_KIND,
  noteIdOfNotification,
  plannedReminders,
  reminderNotificationId,
  syncScheduledReminders,
} from '../../src/features/notes/local-reminders.ts'
import { applyQueued, matchesSearch, sortNotes } from '../../src/features/notes/note-queue.ts'
import {
  beforeChoiceOf,
  egyptDayAndTime,
  egyptInstant,
  homeReminders,
  notifyAtOf,
  parseBeforeMinutes,
  reminderState,
  snoozeMinutesFor,
  snoozeUntil,
} from '../../src/features/notes/note-time.ts'

const MIN = 60_000

const note = (id, extra = {}) => ({
  id,
  clientRequestId: `key-${id}`,
  title: null,
  body: `Body ${id}`,
  remindAt: null,
  remindBeforeMinutes: null,
  notifyAt: null,
  notifiedAt: null,
  doneAt: null,
  createdAt: '2026-11-25T08:00:00Z',
  updatedAt: '2026-11-25T08:00:00Z',
  ...extra,
})

const reminder = (id, remindAt, before = 0, extra = {}) =>
  note(id, { remindAt, remindBeforeMinutes: before, notifyAt: notifyAtOf(remindAt, before), ...extra })

// ---------------------------------------------------------------------------------------------
// Notify time
// ---------------------------------------------------------------------------------------------

test('the notify time is the reminder time minus the chosen minutes', () => {
  assert.equal(notifyAtOf('2026-12-01T07:00:00Z', 0), '2026-12-01T07:00:00.000Z')
  assert.equal(notifyAtOf('2026-12-01T07:00:00Z', 15), '2026-12-01T06:45:00.000Z')
  assert.equal(notifyAtOf('2026-12-01T07:00:00Z', 1440), '2026-11-30T07:00:00.000Z')
  assert.equal(notifyAtOf('2026-12-01T07:00:00Z', null), '2026-12-01T07:00:00.000Z')
  assert.equal(notifyAtOf('2026-12-01T07:00:00Z', -30), '2026-12-01T07:00:00.000Z')
  assert.equal(notifyAtOf(null, 30), null)
})

test('day and time are read on Egypt clock, daylight saving included', () => {
  // Winter: UTC+2. Summer (daylight saving since 2023): UTC+3.
  assert.equal(egyptInstant('2026-12-01', '09:00'), '2026-12-01T07:00:00.000Z')
  assert.equal(egyptInstant('2026-07-01', '09:00'), '2026-07-01T06:00:00.000Z')
  assert.equal(egyptInstant('2026-12-01', '00:30'), '2026-11-30T22:30:00.000Z')
  assert.deepEqual(egyptDayAndTime('2026-11-30T22:30:00Z'), { day: '2026-12-01', time: '00:30' })
  assert.deepEqual(egyptDayAndTime(egyptInstant('2026-07-15', '23:45')), { day: '2026-07-15', time: '23:45' })
})

test('custom "before" minutes accept whole minutes up to one week, Arabic digits too', () => {
  assert.equal(parseBeforeMinutes('30'), 30)
  assert.equal(parseBeforeMinutes(' ٤٥ '), 45)
  assert.equal(parseBeforeMinutes('0'), 0)
  assert.equal(parseBeforeMinutes('10080'), 10080)
  assert.equal(parseBeforeMinutes('10081'), null)
  assert.equal(parseBeforeMinutes('-5'), null)
  assert.equal(parseBeforeMinutes('1.5'), null)
  assert.equal(parseBeforeMinutes(''), null)
  assert.equal(beforeChoiceOf(15), '15')
  assert.equal(beforeChoiceOf(null), '0')
  assert.equal(beforeChoiceOf(45), 'custom')
})

test('snooze targets and the minutes sent for them', () => {
  const now = Date.parse('2026-12-01T22:30:00Z') // 00:30 on 2 December in Cairo
  assert.equal(snoozeUntil('10m', now), '2026-12-01T22:40:00.000Z')
  assert.equal(snoozeUntil('1h', now), '2026-12-01T23:30:00.000Z')
  assert.equal(snoozeUntil('tomorrow', now), '2026-12-03T07:00:00.000Z') // 09:00 on the next Egypt day

  // Queued offline and sent later: the minutes shrink, never below one.
  assert.equal(snoozeMinutesFor('2026-12-01T22:40:00Z', now), 10)
  assert.equal(snoozeMinutesFor('2026-12-01T22:40:00Z', now + 4.5 * MIN), 6)
  assert.equal(snoozeMinutesFor('2026-12-01T22:40:00Z', now + 60 * MIN), 1)
})

test('reminder states and the Home card selection', () => {
  const now = Date.parse('2026-12-01T10:00:00Z')
  const at = (minutes) => new Date(now + minutes * MIN).toISOString()
  assert.equal(reminderState(note('a'), now), 'none')
  assert.equal(reminderState(reminder('b', at(30), 15), now), 'upcoming')
  assert.equal(reminderState(reminder('c', at(10), 15), now), 'due')
  assert.equal(reminderState(reminder('d', at(-5)), now), 'overdue')
  assert.equal(reminderState(reminder('e', at(-5), 0, { doneAt: at(-1) }), now), 'done')

  const notes = [
    reminder('later', at(300)),
    reminder('soon', at(20)),
    reminder('due', at(5), 15),
    reminder('late', at(-60)),
    reminder('next', at(60)),
    reminder('after', at(120)),
    reminder('done', at(-10), 0, { doneAt: at(-1) }),
    note('plain'),
  ]
  const { late, upcoming } = homeReminders(notes, now)
  assert.deepEqual(
    late.map((n) => n.id),
    ['late', 'due'],
  )
  assert.deepEqual(
    upcoming.map((n) => n.id),
    ['soon', 'next', 'after'],
  )
})

// ---------------------------------------------------------------------------------------------
// Outbox rules
// ---------------------------------------------------------------------------------------------

test('queued changes show at once, also on a note written offline', () => {
  const server = [reminder('s1', '2026-12-01T07:00:00Z', 30, { notifiedAt: '2026-12-01T06:30:05Z' })]
  const changes = [
    {
      type: 'create',
      key: 'new',
      userId: 'u',
      at: '2026-11-25T09:00:00Z',
      title: ' Call ',
      body: 'Dr Hany ',
      remindAt: '2026-12-02T07:00:00Z',
      remindBeforeMinutes: 15,
    },
    {
      type: 'update',
      key: 'new',
      userId: 'u',
      at: '2026-11-25T09:01:00Z',
      title: 'Call',
      body: 'Dr Hany at 9',
      remindAt: '2026-12-02T07:00:00Z',
      remindBeforeMinutes: 60,
    },
    { type: 'snooze', key: 'key-s1', userId: 'u', at: '2026-11-25T09:02:00Z', until: '2026-11-25T09:12:00Z' },
    { type: 'done', key: 'new', userId: 'other', at: '2026-11-25T09:03:00Z' },
  ]
  const view = applyQueued(server, changes, 'u')
  const created = view.find((n) => n.clientRequestId === 'new')
  assert.equal(created.title, 'Call')
  assert.equal(created.body, 'Dr Hany at 9')
  assert.equal(created.notifyAt, '2026-12-02T06:00:00.000Z')
  assert.equal(created.doneAt, null, "another user's change is ignored")
  assert.equal(created.queued, true)
  const snoozed = view.find((n) => n.id === 's1')
  assert.equal(snoozed.remindAt, '2026-11-25T09:12:00Z')
  assert.equal(snoozed.remindBeforeMinutes, 0)
  assert.equal(snoozed.notifiedAt, null)

  // A text-only edit keeps "notified"; reopen clears it; delete removes the note.
  const textOnly = applyQueued(
    server,
    [
      {
        type: 'update',
        key: 'key-s1',
        userId: 'u',
        at: 'x',
        title: 'T',
        body: 'B',
        remindAt: '2026-12-01T07:00:00.000Z',
        remindBeforeMinutes: 30,
      },
    ],
    'u',
  )
  assert.equal(textOnly[0].notifiedAt, '2026-12-01T06:30:05Z')
  assert.equal(
    applyQueued(server, [{ type: 'reopen', key: 'key-s1', userId: 'u', at: 'x' }], 'u')[0].notifiedAt,
    null,
  )
  assert.deepEqual(applyQueued(server, [{ type: 'delete', key: 'key-s1', userId: 'u', at: 'x' }], 'u'), [])

  // Sent already and back from the server: the create is not added twice.
  assert.equal(applyQueued([note('new', { clientRequestId: 'new' })], changes.slice(0, 1), 'u').length, 1)
})

test('open notes sort by next reminder, done notes last; search looks in title and text', () => {
  const sorted = sortNotes([
    note('done-old', { doneAt: '2026-11-20T00:00:00Z' }),
    note('plain', { updatedAt: '2026-11-25T09:00:00Z' }),
    reminder('r2', '2026-12-02T07:00:00Z'),
    note('done-new', { doneAt: '2026-11-24T00:00:00Z' }),
    reminder('r1', '2026-12-01T07:00:00Z'),
  ])
  assert.deepEqual(
    sorted.map((n) => n.id),
    ['r1', 'r2', 'plain', 'done-new', 'done-old'],
  )
  assert.ok(matchesSearch({ title: 'Samples', body: '' }, 'sam'))
  assert.ok(matchesSearch({ title: null, body: 'اتصل بالصيدلية' }, 'الصيدلية'))
  assert.ok(!matchesSearch({ title: null, body: 'Order' }, 'visit'))
})

// ---------------------------------------------------------------------------------------------
// Phone notifications (plugin mocked)
// ---------------------------------------------------------------------------------------------

test('notification ids are stable positive 31-bit integers per note', () => {
  const id = '0193a4b2-7c1d-7e00-8f00-1234567890ab'
  const value = reminderNotificationId(id)
  assert.equal(value, reminderNotificationId(id))
  assert.equal(value, reminderNotificationId(id.toUpperCase()))
  assert.ok(Number.isInteger(value) && value > 0 && value <= 0x7fffffff)
  const ids = new Set(
    Array.from({ length: 2000 }, (_, i) =>
      reminderNotificationId(`0193a4b2-7c1d-7e00-8f00-${String(i).padStart(12, '0')}`),
    ),
  )
  assert.equal(ids.size, 2000)
})

/** A fake @capacitor/local-notifications that keeps what is scheduled. */
function fakePlugin(initial = []) {
  const pending = new Map(initial.map((n) => [n.id, n]))
  const calls = { schedule: 0, cancel: 0 }
  return {
    pending,
    calls,
    async getPending() {
      return { notifications: [...pending.values()] }
    },
    async schedule({ notifications }) {
      calls.schedule++
      for (const n of notifications) pending.set(n.id, structuredClone(n))
    },
    async cancel({ notifications }) {
      calls.cancel++
      for (const n of notifications) pending.delete(n.id)
    },
  }
}

const text = (n) => ({ title: n.title || 'Reminder', body: n.body })

test('only open notes with a reminder still ahead are scheduled, nearest first, at most 50', () => {
  const now = Date.parse('2026-12-01T10:00:00Z')
  const at = (minutes) => new Date(now + minutes * MIN).toISOString()
  const planned = plannedReminders(
    [
      reminder('later', at(120), 30),
      reminder('past', at(-1)),
      reminder('done', at(60), 0, { doneAt: at(-5) }),
      note('plain'),
      reminder('soon', at(10)),
    ],
    text,
    { now, exact: false },
  )
  assert.deepEqual(
    planned.map((p) => p.extra.noteId),
    ['soon', 'later'],
  )
  assert.equal(planned[1].schedule.at.toISOString(), at(90))
  assert.equal(planned[0].isExactNotification, false)
  assert.equal(planned[0].channelId, 'reminders')
  assert.equal(planned[0].schedule.allowWhileIdle, true)
  assert.equal(planned[0].id, reminderNotificationId('soon'))

  const many = Array.from({ length: 80 }, (_, i) => reminder(`n${i}`, at(i + 1)))
  assert.equal(plannedReminders(many, text, { now, exact: true }).length, MAX_SCHEDULED)
})

test('sync schedules, keeps, reschedules and cancels only its own notifications', async () => {
  const now = Date.parse('2026-12-01T10:00:00Z')
  const at = (minutes) => new Date(now + minutes * MIN).toISOString()
  const foreign = {
    id: 7,
    title: 'Tracking',
    body: '',
    schedule: { at: new Date(now + MIN) },
    extra: { kind: 'other' },
  }
  const plugin = fakePlugin([foreign])
  const notes = [reminder('a', at(30)), reminder('b', at(60), 15)]

  let result = await syncScheduledReminders(plugin, plannedReminders(notes, text, { now, exact: true }))
  assert.equal(result.scheduled.length, 2)
  assert.equal(plugin.pending.size, 3)

  // Nothing changed: nothing is touched.
  result = await syncScheduledReminders(plugin, plannedReminders(notes, text, { now, exact: true }))
  assert.deepEqual(result, { scheduled: [], cancelled: [] })
  assert.equal(plugin.calls.schedule, 1)

  // Snoozed or edited: rescheduled under the same id. Done: cancelled. The foreign one stays.
  const next = [reminder('a', at(45)), reminder('b', at(60), 15, { doneAt: at(0) })]
  result = await syncScheduledReminders(plugin, plannedReminders(next, text, { now, exact: true }))
  assert.deepEqual(result.scheduled, [reminderNotificationId('a')])
  assert.deepEqual(result.cancelled.sort(), [reminderNotificationId('a'), reminderNotificationId('b')].sort())
  assert.equal(plugin.pending.get(reminderNotificationId('a')).schedule.at.toISOString(), at(45))
  assert.ok(!plugin.pending.has(reminderNotificationId('b')))
  assert.ok(plugin.pending.has(7))

  // Sign-out: everything of ours goes.
  await syncScheduledReminders(plugin, [])
  assert.deepEqual([...plugin.pending.keys()], [7])
})

test('a tapped notification leads to its note, foreign ones to nothing', () => {
  assert.equal(noteIdOfNotification({ kind: REMINDER_KIND, noteId: 'abc' }), 'abc')
  assert.equal(noteIdOfNotification({ kind: 'other', noteId: 'abc' }), null)
  assert.equal(noteIdOfNotification(undefined), null)
})
