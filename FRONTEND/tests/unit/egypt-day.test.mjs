import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  egyptDayOf,
  egyptToday,
  isDayKey,
  isMonthKey,
  monthBounds,
  monthOf,
  relativeDayName,
} from '../../src/lib/egypt-day.ts'

test('days are Egypt days, not UTC days', () => {
  // Winter (UTC+2): 21:59:59Z is still the 20th in Cairo, 22:00:00Z is the 21st.
  assert.equal(egyptDayOf('2026-11-20T21:59:59Z'), '2026-11-20')
  assert.equal(egyptDayOf('2026-11-20T22:00:00Z'), '2026-11-21')
  // Summer time (UTC+3): midnight Cairo is 21:00Z.
  assert.equal(egyptDayOf('2026-07-14T20:59:59Z'), '2026-07-14')
  assert.equal(egyptDayOf('2026-07-14T21:00:00Z'), '2026-07-15')
  assert.equal(egyptToday(Date.parse('2026-11-20T23:30:00Z')), '2026-11-21')
})

test('the last second of a month and the first of the next, in Cairo time', () => {
  assert.equal(egyptDayOf('2026-01-31T21:59:59Z'), '2026-01-31')
  assert.equal(egyptDayOf('2026-01-31T22:00:00Z'), '2026-02-01')
  assert.equal(egyptDayOf('2026-02-28T21:59:59Z'), '2026-02-28')
  assert.equal(egyptDayOf('2026-02-28T22:00:00Z'), '2026-03-01')
  assert.equal(egyptDayOf('2024-02-29T21:59:59Z'), '2024-02-29')
  assert.equal(egyptDayOf('2026-04-30T20:59:59Z'), '2026-04-30') // summer time already
  assert.equal(egyptDayOf('2026-04-30T21:00:00Z'), '2026-05-01')
})

test('day picker steps: previous, next, today, and a jump across months and years', () => {
  assert.equal(addDays('2026-11-21', -1), '2026-11-20')
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2024-03-01', -1), '2024-02-29')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(daysBetween('2026-11-21', '2026-10-07'), -45)
  assert.equal(relativeDayName('2026-11-21', '2026-11-21'), 'today')
  assert.equal(relativeDayName('2026-11-20', '2026-11-21'), 'yesterday')
  assert.equal(relativeDayName('2026-11-22', '2026-11-21'), 'tomorrow')
  assert.equal(relativeDayName('2026-01-01', '2026-11-21'), null)
  assert.equal(isDayKey('2026-02-29'), true) // parses; the native picker never offers it
  assert.equal(isDayKey('2026-1-1'), false)
  assert.equal(isDayKey(undefined), false)
})

test('month navigator: previous, next, and month lengths', () => {
  assert.equal(monthOf('2026-11-21'), '2026-11')
  assert.equal(addMonths('2026-11', 1), '2026-12')
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(addMonths('2026-01', -1), '2025-12')
  assert.equal(addMonths('2026-03', -14), '2025-01')
  assert.deepEqual(['2026-02', '2024-02', '2026-04', '2026-01'].map(daysInMonth), [28, 29, 30, 31])
  assert.deepEqual(monthBounds('2024-02'), { first: '2024-02-01', last: '2024-02-29' })
  assert.equal(isMonthKey('2026-13'), false)
  assert.equal(isMonthKey('2026-09'), true)
})
