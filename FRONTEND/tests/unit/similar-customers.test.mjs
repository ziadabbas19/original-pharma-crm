import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateCandidates, similarParams } from '../../src/features/customers/similar-customers.ts'

test('the live duplicate check waits for a town and three letters or a phone number', () => {
  assert.equal(similarParams('doctor', 'احمد', ''), null)
  assert.equal(similarParams('doctor', ' اح ', 'town'), null)
  assert.deepEqual(similarParams('doctor', ' احمد محمد ', 'town'), {
    Type: 'doctor',
    TerritoryId: 'town',
    Name: 'احمد محمد',
  })
  // A phone number alone is enough; a short one is left out.
  assert.deepEqual(similarParams('pharmacy', '', 'town', '0100 123 4567'), {
    Type: 'pharmacy',
    TerritoryId: 'town',
    Phone: '0100 123 4567',
  })
  assert.deepEqual(similarParams('hospital', 'Nour', 'town', '12'), {
    Type: 'hospital',
    TerritoryId: 'town',
    Name: 'Nour',
  })
})

test('only a duplicate_suspected refusal carries candidates', () => {
  const candidates = [{ id: 'a', name: 'Dr. A', same: false, limited: false }]
  assert.deepEqual(duplicateCandidates({ code: 'duplicate_suspected', details: { candidates } }), candidates)
  assert.equal(duplicateCandidates({ code: 'doctor_exists', details: { doctorId: 'a' } }), null)
  assert.equal(duplicateCandidates({ code: 'duplicate_suspected', details: {} }), null)
  assert.equal(duplicateCandidates({ code: null, details: {} }), null)
})
