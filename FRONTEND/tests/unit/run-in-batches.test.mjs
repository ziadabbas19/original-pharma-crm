import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BULK_BATCH_SIZE,
  BULK_PREVIEW_SIZE,
  NOT_PROCESSED,
  runInBatches,
} from '../../src/components/bulk/run-in-batches.ts'

const idList = (count, prefix = 'id') => Array.from({ length: count }, (_, i) => `${prefix}-${i}`)

const response = (items, dryRun = false) => ({
  deleted: items.filter((i) => i.outcome === 'deleted').length,
  archived: items.filter((i) => i.outcome === 'archived').length,
  restored: items.filter((i) => i.outcome === 'restored').length,
  updated: items.filter((i) => i.outcome === 'updated').length,
  blocked: items.filter((i) => i.outcome === 'blocked').length,
  dryRun,
  items,
})

/** A server that deletes everything and records the size of each request. */
function recorder(outcome = 'deleted') {
  const sizes = []
  const send = async (ids) => {
    sizes.push(ids.length)
    return response(ids.map((id) => ({ id, outcome })))
  }
  return { sizes, send }
}

test('a selection that fits is sent as one request and never reports progress', async () => {
  const { sizes, send } = recorder()
  const progress = []
  const result = await runInBatches(idList(BULK_BATCH_SIZE), send, { onProgress: (p) => progress.push(p) })
  assert.deepEqual(sizes, [BULK_BATCH_SIZE])
  assert.equal(result.deleted, BULK_BATCH_SIZE)
  assert.deepEqual(progress, [])
})

test('a large selection is split and the results add up in the original order', async () => {
  const { sizes, send } = recorder()
  const ids = idList(1201)
  const progress = []
  const result = await runInBatches(ids, send, { onProgress: (p) => progress.push(p.done) })
  assert.deepEqual(sizes, [500, 500, 201])
  assert.equal(result.deleted, 1201)
  assert.equal(result.blocked, 0)
  assert.deepEqual(
    result.items.map((i) => i.id),
    ids,
  )
  assert.deepEqual(progress, [0, 500, 1000, 1201])
})

test('repeated ids are sent once', async () => {
  const { sizes, send } = recorder()
  const result = await runInBatches([...idList(600), ...idList(600)], send)
  assert.deepEqual(sizes, [500, 100])
  assert.equal(result.items.length, 600)
})

test('a preview is judged as one set up to its own limit', async () => {
  const { sizes, send } = recorder()
  const result = await runInBatches(idList(BULK_PREVIEW_SIZE), send, { dryRun: true })
  assert.deepEqual(sizes, [BULK_PREVIEW_SIZE])
  assert.equal(result.items.length, BULK_PREVIEW_SIZE)
})

test('a preview above its limit is split, flagged as a preview and never sent twice', async () => {
  const sizes = []
  const send = async (ids) => {
    sizes.push(ids.length)
    return response(
      ids.map((id) => ({ id, outcome: 'blocked', code: 'territory_has_children' })),
      true,
    )
  }
  const result = await runInBatches(idList(BULK_PREVIEW_SIZE + 1), send, { dryRun: true })
  assert.deepEqual(sizes, [BULK_PREVIEW_SIZE, 1])
  assert.equal(result.dryRun, true)
})

test('a parent refused before its child was handled is sent again and goes through', async () => {
  const parent = 'parent'
  const child = 'child'
  const ids = [parent, ...idList(499), child]
  const gone = new Set()
  const calls = []
  const send = async (batch) => {
    calls.push(batch.length)
    const items = batch.map((id) => {
      if (id === parent && !gone.has(child)) return { id, outcome: 'blocked', code: 'territory_has_children' }
      gone.add(id)
      return { id, outcome: 'deleted' }
    })
    return response(items)
  }
  const result = await runInBatches(ids, send)
  assert.deepEqual(calls, [500, 1, 1])
  assert.equal(result.deleted, 501)
  assert.equal(result.blocked, 0)
})

test('chains of related items settle over several passes', async () => {
  const ids = ['a', ...idList(499, 'x'), 'b', ...idList(499, 'y'), 'c']
  const gone = new Set()
  const needs = { a: 'b', b: 'c' }
  const send = async (batch) => {
    const items = batch.map((id) => {
      if (needs[id] && !gone.has(needs[id])) return { id, outcome: 'blocked', code: 'user_has_reports' }
      gone.add(id)
      return { id, outcome: 'deleted' }
    })
    return response(items)
  }
  const result = await runInBatches(ids, send)
  assert.equal(result.deleted, ids.length)
})

test('refusals that nothing can clear are not sent again', async () => {
  let calls = 0
  const send = async (batch) => {
    calls++
    return response(batch.map((id) => ({ id, outcome: 'blocked', code: 'last_admin' })))
  }
  const result = await runInBatches(idList(600), send)
  assert.equal(calls, 2)
  assert.equal(result.blocked, 600)
})

test('waiting items stop being retried when a pass moves nothing', async () => {
  let calls = 0
  const send = async (batch) => {
    calls++
    return response(batch.map((id) => ({ id, outcome: 'blocked', code: 'territory_has_children' })))
  }
  const result = await runInBatches(idList(600), send)
  assert.equal(calls, 2)
  assert.equal(result.blocked, 600)
})

test('a failure on the first request changes nothing and is reported as an error', async () => {
  const failure = new Error('offline')
  await assert.rejects(
    runInBatches(idList(600), async () => {
      throw failure
    }),
    failure,
  )
})

test('a failure part way keeps what was done and reports the rest as not processed', async () => {
  let call = 0
  const send = async (batch) => {
    if (++call === 2) throw new Error('offline')
    return response(batch.map((id) => ({ id, outcome: 'deleted' })))
  }
  const result = await runInBatches(idList(1200), send)
  assert.equal(result.deleted, 500)
  assert.equal(result.blocked, 700)
  assert.equal(result.items.length, 1200)
  assert.ok(result.items.slice(500).every((i) => i.code === NOT_PROCESSED))
})

test('a failure while retrying keeps the first refusal reason', async () => {
  let call = 0
  const send = async (batch) => {
    call++
    if (call === 3) throw new Error('offline')
    return response(
      batch.map((id) =>
        id === 'id-0'
          ? { id, outcome: 'blocked', code: 'territory_has_children' }
          : { id, outcome: 'deleted' },
      ),
    )
  }
  const result = await runInBatches(idList(600), send)
  assert.equal(result.deleted, 599)
  assert.equal(result.items[0].code, 'territory_has_children')
})

test('a preview that fails part way is an error, not a partial forecast', async () => {
  let call = 0
  const send = async (batch) => {
    if (++call === 2) throw new Error('offline')
    return response(
      batch.map((id) => ({ id, outcome: 'deleted' })),
      true,
    )
  }
  await assert.rejects(runInBatches(idList(BULK_PREVIEW_SIZE + 1), send, { dryRun: true }))
})
