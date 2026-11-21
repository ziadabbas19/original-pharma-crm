import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canAddPharmacy,
  EMPTY_PHARMACY,
  pharmacyProblems,
  toCreatePharmacyRequest,
  withPharmacy,
} from '../../src/features/customers/pharmacy-form.ts'

const rep = {
  'customers:read': 'own',
  'customers:create': 'own',
  'visits:create': 'own',
  'tracking:report': 'own',
}

test('"Add pharmacy" shows only for people given customers:create-pharmacy', () => {
  assert.equal(canAddPharmacy({ ...rep, 'customers:create-pharmacy': 'own' }), true)
  // Adding doctors, or editing customers, is not the same right.
  assert.equal(canAddPharmacy(rep), false)
  assert.equal(canAddPharmacy({ 'customers:manage': 'team', 'customers:delete': 'team' }), false)
  assert.equal(canAddPharmacy({ 'customers:create-pharmacy': 'all' }), true)
})

test('a name and a town are required; the rest is optional and trimmed', () => {
  assert.deepEqual(pharmacyProblems(EMPTY_PHARMACY), { name: 'required', townId: 'required' })
  assert.deepEqual(pharmacyProblems({ ...EMPTY_PHARMACY, name: '  ', townId: 't1' }), {
    name: 'required',
    townId: undefined,
  })
  assert.deepEqual(
    toCreatePharmacyRequest({
      name: ' Al Shifa ',
      nameAr: ' ',
      townId: 't1',
      address: ' 12 Abbas El Akkad ',
      phone: '',
      notes: 'Opens at 10',
    }),
    {
      name: 'Al Shifa',
      nameAr: null,
      territoryId: 't1',
      address: '12 Abbas El Akkad',
      phone: null,
      notes: 'Opens at 10',
    },
  )
})

test('the new pharmacy joins the list at once, in name order and only once', () => {
  const a = { id: 'a', name: 'Ezaby' }
  const c = { id: 'c', name: 'Seif' }
  const added = { id: 'b', name: 'Nour' }
  assert.deepEqual(
    withPharmacy([a, c], added).map((p) => p.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    withPharmacy([a, added, c], added).map((p) => p.id),
    ['a', 'b', 'c'],
  )
  assert.deepEqual(
    withPharmacy(undefined, added).map((p) => p.id),
    ['b'],
  )
})
