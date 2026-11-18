import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canStartVisit,
  DEFAULT_VISIT_RULES,
  evaluateProximity,
  locationFailureOf,
  willNeedReview,
} from '../../src/features/visits/visit-proximity.ts'

const clinic = { lat: 30.0561, lng: 31.3301, geofenceRadiusMeters: 150 }
const fixAt = (lat, accuracy = 10, isMock = false) => ({ lat, lng: clinic.lng, accuracy, isMock })

test('a fix inside the radius is inside and can start', () => {
  const result = evaluateProximity(clinic, fixAt(30.0565), DEFAULT_VISIT_RULES)
  assert.equal(result.state, 'inside')
  assert.ok(result.distance > 40 && result.distance < 50)
  assert.equal(canStartVisit(result), true)
  assert.equal(willNeedReview(result), false)
})

test('part of the accuracy widens the range, up to the same cap as the server', () => {
  // About 190 m away: 150 m radius + 50 m capped allowance covers it, even with a 90 m fix.
  const near = evaluateProximity(clinic, fixAt(clinic.lat + 0.0017, 90), DEFAULT_VISIT_RULES)
  assert.equal(near.state, 'inside')
  assert.equal(near.allowed, 200)

  // About 267 m away stays outside.
  const far = evaluateProximity(clinic, fixAt(clinic.lat + 0.0024, 90), DEFAULT_VISIT_RULES)
  assert.equal(far.state, 'outside')
  assert.equal(far.allowed, 200)
})

test('outside the range the visit can start and is reviewed, with the distance shown', () => {
  const result = evaluateProximity(clinic, fixAt(clinic.lat + 0.004), DEFAULT_VISIT_RULES)
  assert.equal(result.state, 'outside')
  assert.ok(result.distance > 400 && result.distance < 500)
  assert.equal(result.refused, false)
  assert.equal(canStartVisit(result), true)
  assert.equal(willNeedReview(result), true)
})

test('a server that refuses check-ins outside the range blocks the start', () => {
  const rules = { ...DEFAULT_VISIT_RULES, rejectOutsideGeofence: true }
  const result = evaluateProximity(clinic, fixAt(clinic.lat + 0.004), rules)
  assert.equal(result.refused, true)
  assert.equal(canStartVisit(result), false)
})

test('a customer with no saved location is reported before the phone location matters', () => {
  const noLocation = { lat: null, lng: null, geofenceRadiusMeters: 150 }
  assert.equal(evaluateProximity(noLocation, null, DEFAULT_VISIT_RULES).state, 'noCustomerLocation')
  assert.equal(evaluateProximity(noLocation, fixAt(30), DEFAULT_VISIT_RULES).state, 'noCustomerLocation')
  assert.equal(canStartVisit(evaluateProximity(noLocation, null, DEFAULT_VISIT_RULES)), false)
})

test('no fix reports why, and blocks the start', () => {
  const denied = evaluateProximity(clinic, null, DEFAULT_VISIT_RULES, 'denied')
  assert.deepEqual(denied, { state: 'locationUnavailable', reason: 'denied' })
  assert.equal(canStartVisit(denied), false)
})

test('a fix worse than the server limit asks for a better one', () => {
  const result = evaluateProximity(clinic, fixAt(clinic.lat, 140), DEFAULT_VISIT_RULES)
  assert.deepEqual(result, { state: 'lowAccuracy', accuracy: 140, maxAccuracy: 100 })
  assert.equal(canStartVisit(result), false)
})

test('a simulated location inside the range still goes to review', () => {
  const result = evaluateProximity(clinic, fixAt(30.0565, 10, true), DEFAULT_VISIT_RULES)
  assert.equal(result.state, 'inside')
  assert.equal(willNeedReview(result), true)
})

test('browser location errors map to what the rep can do about them', () => {
  assert.equal(locationFailureOf({ code: 1 }), 'denied')
  assert.equal(locationFailureOf({ code: 3 }), 'timeout')
  assert.equal(locationFailureOf({ code: 2 }), 'unavailable')
  assert.equal(locationFailureOf(new Error('plugin failed')), 'unavailable')
})
