import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftOf, fieldError, requestOf } from '../../src/features/settings/location-trust-form.ts'

const saved = {
  maxSpeedKmh: 200,
  maxDistanceFromDoctorMeters: 500,
  accuracyAllowanceMeters: 50,
  lowTrustAccuracyMeters: 100,
  perfectAccuracyMeters: 1.5,
  repeatedAccuracyRun: 6,
  mockPolicy: 'flagOnly',
  deviceSignalsRetentionDays: 30,
  driftFromClinicMeters: 150,
  driftFromVisitsMeters: 150,
  visibility: 'visitOnly',
  visitWindowBufferMinutes: 5,
  isDefault: true,
  updatedAt: null,
  updatedByName: null,
}

test('the saved settings round-trip through the form unchanged', () => {
  const request = requestOf(draftOf(saved))
  assert.deepEqual(request, {
    mockPolicy: 'flagOnly',
    maxSpeedKmh: 200,
    maxDistanceFromDoctorMeters: 500,
    accuracyAllowanceMeters: 50,
    lowTrustAccuracyMeters: 100,
    perfectAccuracyMeters: 1.5,
    repeatedAccuracyRun: 6,
    deviceSignalsRetentionDays: 30,
    driftFromClinicMeters: 150,
    driftFromVisitsMeters: 150,
    visibility: 'visitOnly',
    visitWindowBufferMinutes: 5,
  })
})

test('values outside the server limits are refused before sending', () => {
  assert.equal(fieldError('maxSpeedKmh', '20'), 'range')
  assert.equal(fieldError('maxSpeedKmh', ''), 'required')
  assert.equal(fieldError('repeatedAccuracyRun', '6.5'), 'integer')
  assert.equal(fieldError('deviceSignalsRetentionDays', '400'), 'range')
  assert.equal(fieldError('perfectAccuracyMeters', '0'), null)
  assert.equal(requestOf({ ...draftOf(saved), maxDistanceFromDoctorMeters: 'far' }), null)
})

test('the stricter policy is sent as chosen', () => {
  const request = requestOf({
    ...draftOf(saved),
    mockPolicy: 'flagAndExclude',
    maxDistanceFromDoctorMeters: ' 300 ',
  })
  assert.equal(request.mockPolicy, 'flagAndExclude')
  assert.equal(request.maxDistanceFromDoctorMeters, 300)
})

test('the drift limits follow the server limits', () => {
  assert.equal(fieldError('driftFromClinicMeters', '10'), 'range')
  assert.equal(fieldError('driftFromVisitsMeters', '150'), null)
  assert.equal(requestOf({ ...draftOf(saved), driftFromVisitsMeters: '' }), null)
})

test('the visibility mode and the visit buffer are sent with the other settings', () => {
  const request = requestOf({ ...draftOf(saved), visibility: 'allDay', visitWindowBufferMinutes: '0' })
  assert.equal(request.visibility, 'allDay')
  assert.equal(request.visitWindowBufferMinutes, 0)
  assert.equal(fieldError('visitWindowBufferMinutes', '61'), 'range')
  assert.equal(fieldError('visitWindowBufferMinutes', '2.5'), 'integer')
})
