import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clinicOutcomeKey,
  distanceCells,
  gapParts,
  locationBadges,
  mapLink,
  numberByDate,
} from '../../src/features/visits/visit-location.ts'

const location = (patch = {}) => ({
  lat: 30.089,
  lng: 31.324,
  accuracy: 12,
  isMock: false,
  signalCodes: [],
  clinicLocationOutcome: 'compared',
  clinicDistanceMeters: 20,
  previousVisitDistanceMeters: 12,
  sincePreviousVisitSeconds: 3600,
  medianDistanceMeters: 8,
  nearestVisitDistanceMeters: 5,
  referenceVisitCount: 3,
  goodFix: true,
  locationDrift: false,
  driftSources: [],
  ...patch,
})

test('a normal visit shows no badge', () => {
  assert.deepEqual(locationBadges(location(), false), [])
})

test('drift comes first, then flagged, then what happened to the clinic location', () => {
  assert.deepEqual(locationBadges(location({ locationDrift: true, driftSources: ['median'] }), true), [
    'drift',
    'flagged',
  ])
  assert.deepEqual(locationBadges(location({ clinicLocationOutcome: 'savedAsClinic' }), false), [
    'firstVisit',
  ])
  assert.deepEqual(locationBadges(location({ clinicLocationOutcome: 'notSaved' }), true), [
    'flagged',
    'notSaved',
  ])
  assert.deepEqual(locationBadges(null, true), ['flagged'])
})

test('the comparisons that exceeded the limits are marked, missing ones are empty', () => {
  const cells = distanceCells(
    location({ medianDistanceMeters: null, previousVisitDistanceMeters: 400, driftSources: ['previous'] }),
  )
  assert.deepEqual(cells, [
    { key: 'clinic', meters: 20, exceeded: false },
    { key: 'previous', meters: 400, exceeded: true },
    { key: 'median', meters: null, exceeded: false },
  ])
  assert.deepEqual(
    distanceCells(undefined).map((c) => c.meters),
    [null, null, null],
  )
})

test('visits are numbered by date with the oldest as 1, whatever the list order', () => {
  const numbers = numberByDate([
    { visitId: 'c', checkInAt: '2026-11-20T10:00:00Z' },
    { visitId: 'a', checkInAt: '2026-11-01T09:00:00.5Z' },
    { visitId: 'b', checkInAt: '2026-11-10T09:00:00Z' },
  ])
  assert.deepEqual(
    [...numbers.entries()],
    [
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ],
  )
})

test('the clinic outcome line is shown only when the visit saved it or could not', () => {
  assert.equal(clinicOutcomeKey('compared'), null)
  assert.equal(clinicOutcomeKey('savedAsClinic'), 'visits.location.outcomes.savedAsClinic')
  assert.equal(clinicOutcomeKey('notSaved'), 'visits.location.outcomes.notSaved')
})

test('map links and gaps are formatted for display', () => {
  assert.equal(
    mapLink(30.0890001, 31.324),
    'https://www.openstreetmap.org/?mlat=30.089000&mlon=31.324000#map=18/30.089000/31.324000',
  )
  assert.deepEqual(gapParts(90061), { days: 1, hours: 1, minutes: 1 })
  assert.equal(gapParts(null), null)
  assert.equal(gapParts(-5), null)
})
