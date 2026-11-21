import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupTownsByArea, showsCityAmounts } from '../../src/features/expenses/city-amounts.ts'
import { parseAmount } from '../../src/features/expenses/expense-queue.ts'

test('the default daily amounts show only for people given expenses:settings', () => {
  const rep = { 'expenses:read-own': 'own', 'expenses:write-own': 'own', 'visits:create': 'own' }
  assert.equal(showsCityAmounts(rep), false)
  assert.equal(showsCityAmounts({ ...rep, 'expenses:settings': 'own' }), true)
  assert.equal(showsCityAmounts({ 'expenses:settings': 'all' }), true)
  // Reading or managing expenses is not enough.
  assert.equal(showsCityAmounts({ 'expenses:read': 'team', 'expenses:manage': 'team' }), false)
  assert.equal(showsCityAmounts({}), false)
})

test('towns are grouped by area in the order the server lists them', () => {
  const towns = [
    { id: 'n', name: 'Nasr City', areaId: 'east', areaName: 'East Cairo', defaultDailyExpense: 60 },
    { id: 'h', name: 'Heliopolis', areaId: 'east', areaName: 'East Cairo', defaultDailyExpense: 50 },
    { id: 'd', name: 'Dokki', areaId: 'giza', areaName: 'Giza', defaultDailyExpense: 0 },
  ]
  assert.deepEqual(
    groupTownsByArea(towns).map((g) => [g.areaId, g.towns.map((t) => t.id)]),
    [
      ['east', ['n', 'h']],
      ['giza', ['d']],
    ],
  )
  assert.deepEqual(groupTownsByArea([]), [])
})

test('amounts are validated like the expense lines: two decimals at most', () => {
  assert.equal(parseAmount('72.5'), 72.5)
  assert.equal(parseAmount('٧٢٫٥٠'), 72.5)
  assert.equal(parseAmount('0'), 0)
  assert.equal(parseAmount('12.345'), null)
  assert.equal(parseAmount('-5'), null)
  assert.equal(parseAmount(''), null)
})
