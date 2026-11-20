import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkFinished,
  checkRequested,
  IDLE_MOCK_WATCH,
  markReported,
  observeFix,
  REPORT_INTERVAL_MS,
  reportDue,
  RETRY_DELAYS_MS,
  retryDelay,
  secondsUntilCheck,
} from '../../src/features/integrity/mock-watch.ts'

const T0 = Date.parse('2026-11-19T09:00:00Z')
const mockFix = { isMock: true, at: '2026-11-19T09:00:00.000Z' }
const realFix = { isMock: false, at: '2026-11-19T09:05:00.000Z' }

test('real fixes keep the message hidden', () => {
  assert.equal(observeFix(IDLE_MOCK_WATCH, realFix, T0), IDLE_MOCK_WATCH)
})

test('a mock fix shows the message, marks tracking untrusted and schedules a re-check', () => {
  const state = observeFix(IDLE_MOCK_WATCH, mockFix, T0)
  assert.equal(state.active, true)
  assert.equal(state.since, mockFix.at)
  assert.equal(state.nextCheckAt, T0 + RETRY_DELAYS_MS[0])
  assert.equal(secondsUntilCheck(state, T0), RETRY_DELAYS_MS[0] / 1000)
})

test('more mock fixes keep the same episode and its schedule', () => {
  const first = observeFix(IDLE_MOCK_WATCH, mockFix, T0)
  const again = observeFix(first, { isMock: true, at: '2026-11-19T09:00:30.000Z' }, T0 + 30_000)
  assert.equal(again, first)
})

test('the app keeps checking with a growing pause, also when no fix comes back', () => {
  let state = observeFix(IDLE_MOCK_WATCH, mockFix, T0)
  const pauses = []
  let now = T0
  for (let i = 0; i < 6; i++) {
    now = state.nextCheckAt
    state = checkFinished(state, i % 2 === 0 ? true : null, now)
    pauses.push(state.nextCheckAt - now)
  }
  assert.equal(state.active, true)
  assert.deepEqual(pauses, [30_000, 60_000, 120_000, 120_000, 120_000, 120_000])
  assert.equal(retryDelay(99), RETRY_DELAYS_MS.at(-1))
})

test('a real fix during a re-check ends the episode and hides the message', () => {
  const state = observeFix(IDLE_MOCK_WATCH, mockFix, T0)
  assert.deepEqual(checkFinished(state, false, T0 + 15_000), IDLE_MOCK_WATCH)
  assert.deepEqual(observeFix(state, realFix, T0 + 15_000), IDLE_MOCK_WATCH)
})

test('"Check now" makes the next check due at once', () => {
  const state = observeFix(IDLE_MOCK_WATCH, mockFix, T0)
  const now = T0 + 5_000
  const requested = checkRequested(state, now)
  assert.equal(requested.nextCheckAt, now)
  assert.equal(secondsUntilCheck(requested, now), 0)
  assert.equal(checkRequested(IDLE_MOCK_WATCH, now), IDLE_MOCK_WATCH)
})

test('an episode is reported once, and again only after the report interval', () => {
  const state = observeFix(IDLE_MOCK_WATCH, mockFix, T0)
  assert.equal(reportDue(state, T0), true)
  const reported = markReported(state, T0)
  assert.equal(reportDue(reported, T0 + 60_000), false)
  assert.equal(reportDue(reported, T0 + REPORT_INTERVAL_MS), true)
  assert.equal(reportDue(IDLE_MOCK_WATCH, T0), false)
})
