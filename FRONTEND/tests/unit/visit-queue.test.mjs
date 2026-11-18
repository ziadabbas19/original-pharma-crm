import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyFailure,
  drainSteps,
  forgotToCheckOut,
  nextSeq,
  sendableSteps,
} from '../../src/features/visits/visit-queue.ts'

const step = (seq, type, visitId = 'a') => ({
  seq,
  type,
  visitId,
  userId: 'u',
  queuedAt: '2026-11-18T08:00:00Z',
})
const offline = null
const refusal = (status, code) => ({ status, code })

/** A fake server: answers with what `results` says for "type:visitId", and records what it was sent. */
function fakeServer(results = {}) {
  const log = []
  const handlers = {
    beforeCheckOut: async (s) => {
      log.push(`content:${s.visitId}`)
      return results[`content:${s.visitId}`] !== 'offline'
    },
    send: async (s) => {
      log.push(`${s.type}:${s.visitId}`)
      const result = results[`${s.type}:${s.visitId}`]
      if (result !== undefined) throw result
    },
    sent: async () => {},
    refused: async (s, failure) => log.push(`refused:${s.type}:${s.visitId}:${failure.code}`),
    failureOf: (error) => (error === 'offline' ? offline : error),
  }
  return { log, handlers }
}

test('steps leave in the order they happened, whatever order they were stored in', async () => {
  const { log, handlers } = fakeServer()
  const result = await drainSteps(
    [step(3, 'checkOut'), step(1, 'checkIn'), step(2, 'photo')],
    new Set(),
    handlers,
  )
  assert.deepEqual(log, ['checkIn:a', 'photo:a', 'content:a', 'checkOut:a'])
  assert.deepEqual(result, { sent: 3, refused: 0, interrupted: false })
})

test('content goes out before the check-out that closes the visit', async () => {
  const { log, handlers } = fakeServer()
  await drainSteps([step(1, 'checkOut')], new Set(), handlers)
  assert.deepEqual(log, ['content:a', 'checkOut:a'])
})

test('no connection stops the run and keeps everything for later, in order', async () => {
  const { log, handlers } = fakeServer({ 'checkIn:a': 'offline' })
  const result = await drainSteps(
    [step(1, 'checkIn'), step(2, 'checkOut'), step(3, 'checkIn', 'b')],
    new Set(),
    handlers,
  )
  assert.deepEqual(log, ['checkIn:a'])
  assert.deepEqual(result, { sent: 0, refused: 0, interrupted: true })
})

test('content that cannot reach the server holds the check-out back', async () => {
  const { log, handlers } = fakeServer({ 'content:a': 'offline' })
  const result = await drainSteps([step(1, 'checkOut')], new Set(), handlers)
  assert.deepEqual(log, ['content:a'])
  assert.equal(result.interrupted, true)
})

test('a refused check-in holds back the rest of that visit and no other visit', async () => {
  const { log, handlers } = fakeServer({ 'checkIn:a': refusal(409, 'visit-in-progress') })
  const steps = [step(1, 'checkIn'), step(2, 'photo'), step(3, 'checkOut'), step(4, 'checkIn', 'b')]
  const result = await drainSteps(steps, new Set(), handlers)
  assert.deepEqual(log, ['checkIn:a', 'refused:checkIn:a:visit-in-progress', 'checkIn:b'])
  assert.deepEqual(result, { sent: 1, refused: 1, interrupted: false })
})

test('a visit refused earlier keeps waiting for the rep to retry it', async () => {
  const { log, handlers } = fakeServer()
  await drainSteps([step(2, 'checkOut'), step(3, 'checkIn', 'b')], new Set(['a']), handlers)
  assert.deepEqual(log, ['checkIn:b'])
})

test('a visit already closed elsewhere counts as checked out', async () => {
  const { log, handlers } = fakeServer({ 'checkOut:a': refusal(409, 'visit-not-in-progress') })
  const result = await drainSteps([step(1, 'checkOut')], new Set(), handlers)
  assert.deepEqual(log, ['content:a', 'checkOut:a'])
  assert.deepEqual(result, { sent: 1, refused: 0, interrupted: false })
})

test('server trouble and expired sessions are retried; rule refusals are not', () => {
  const checkIn = step(1, 'checkIn')
  assert.equal(classifyFailure(checkIn, offline), 'retry-later')
  for (const status of [401, 408, 429, 500, 503]) {
    assert.equal(classifyFailure(checkIn, refusal(status, 'x')), 'retry-later', String(status))
  }
  assert.equal(classifyFailure(checkIn, refusal(422, 'no-active-shift')), 'refused')
  assert.equal(classifyFailure(checkIn, refusal(409, 'visit-in-progress')), 'refused')
  assert.equal(classifyFailure(checkIn, refusal(409, 'visit-not-in-progress')), 'refused')
  assert.equal(classifyFailure(step(1, 'checkOut'), refusal(409, 'visit-not-in-progress')), 'already-done')
})

test('a retried step returns to its original place in the queue', () => {
  const retried = step(1, 'checkIn')
  const later = step(2, 'checkOut')
  assert.deepEqual(sendableSteps([later, retried], new Set()), [retried, later])
})

test('new steps queue behind existing ones even when the clock moved backwards', () => {
  assert.equal(nextSeq([], 1000), 1000)
  assert.equal(nextSeq([{ seq: 5000 }], 1000), 5001)
})

test('a visit is treated as forgotten after four hours or on a later day', () => {
  const now = new Date('2026-11-18T15:00:00').getTime()
  assert.equal(forgotToCheckOut('2026-11-18T14:00:00', now), false)
  assert.equal(forgotToCheckOut('2026-11-18T11:00:00', now), true)
  assert.equal(forgotToCheckOut('2026-11-17T23:30:00', new Date('2026-11-18T00:30:00').getTime()), true)
})
