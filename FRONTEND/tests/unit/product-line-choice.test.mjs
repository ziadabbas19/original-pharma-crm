import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialLineChoice,
  lineChoiceMissing,
  lineIdsToSave,
  sameLineIds,
  toggleLine,
} from '../../src/features/users/product-line-choice.ts'
import { readCache, writeCache } from '../../src/lib/offline-cache.ts'

test('a new user, or one with no line stored, starts on all product lines', () => {
  assert.deepEqual(initialLineChoice([]), { all: true, lineIds: [] })
  assert.deepEqual(initialLineChoice(undefined), { all: true, lineIds: [] })
  assert.deepEqual(initialLineChoice(null), { all: true, lineIds: [] })
})

test('a user who already has lines stays limited to them', () => {
  const choice = initialLineChoice(['cardio', 'pediatric'])
  assert.equal(choice.all, false)
  assert.deepEqual(lineIdsToSave(choice), ['cardio', 'pediatric'])
})

test('all product lines stores nothing, even with lines ticked before', () => {
  const choice = { ...initialLineChoice(['cardio']), all: true }
  assert.deepEqual(lineIdsToSave(choice), [])
  assert.equal(lineChoiceMissing(choice), false)
})

test('specific lines need at least one ticked', () => {
  const limited = { all: false, lineIds: [] }
  assert.equal(lineChoiceMissing(limited), true)
  const one = toggleLine(limited, 'derma', true)
  assert.equal(lineChoiceMissing(one), false)
  assert.deepEqual(lineIdsToSave(one), ['derma'])
  assert.deepEqual(toggleLine(one, 'derma', false).lineIds, [])
})

test('the saved lines only change when the set does', () => {
  assert.equal(sameLineIds(['a', 'b'], ['b', 'a']), true)
  assert.equal(sameLineIds(['a'], ['a', 'b']), false)
  assert.equal(sameLineIds([], []), true)
})

test('a product copy saved for another user or permissions version is not reused', () => {
  const items = new Map()
  globalThis.localStorage = {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: (k) => items.delete(k),
  }
  try {
    writeCache('products', [{ id: 'p1' }], 'rep-1.4')
    assert.deepEqual(readCache('products', 'rep-1.4')?.data, [{ id: 'p1' }])
    assert.equal(readCache('products', 'rep-2.4'), undefined)
    assert.equal(readCache('products', 'rep-1.5'), undefined)
  } finally {
    delete globalThis.localStorage
  }
})
