import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeSignals,
  signalsLookSpoofed,
  unknownSignals,
} from '../../src/lib/platform/device-signals.ts'

const now = new Date('2026-11-19T09:00:00Z')

test('what the native plugin returns is kept when well formed', () => {
  const signals = normalizeSignals(
    {
      developerOptionsEnabled: true,
      mockLocationAppSelected: true,
      spoofingApps: ['com.lexa.fakegps'],
      autoTimeEnabled: false,
      autoTimeZoneEnabled: true,
      emulator: false,
      emulatorSignals: [],
      rooted: true,
      rootSignals: ['su-binary', 'test-keys'],
      collectedAt: '2026-11-19T08:59:58.120Z',
    },
    'android',
    now,
  )
  assert.equal(signals.platform, 'android')
  assert.equal(signals.mockLocationAppSelected, true)
  assert.deepEqual(signals.rootSignals, ['su-binary', 'test-keys'])
  assert.equal(signals.collectedAt, '2026-11-19T08:59:58.120Z')
  assert.equal(signalsLookSpoofed(signals), true)
})

test('anything malformed becomes "unknown" instead of failing', () => {
  const signals = normalizeSignals(
    {
      developerOptionsEnabled: 'yes',
      spoofingApps: 'com.fake',
      rootSignals: [1, '', 'x'.repeat(500), 'ok'],
      collectedAt: 'soon',
    },
    'android',
    now,
  )
  assert.equal(signals.developerOptionsEnabled, null)
  assert.deepEqual(signals.spoofingApps, [])
  assert.deepEqual(signals.rootSignals, ['ok'])
  assert.equal(signals.collectedAt, now.toISOString())
  assert.deepEqual(normalizeSignals(null, 'android', now), unknownSignals('android', now))
})

test('lists are capped and the web reports nothing it cannot know', () => {
  const many = Array.from({ length: 40 }, (_, i) => `com.app${i}`)
  assert.equal(normalizeSignals({ spoofingApps: many }, 'android', now).spoofingApps.length, 20)
  const web = unknownSignals('web', now)
  assert.equal(web.mockLocationAppSelected, null)
  assert.equal(signalsLookSpoofed(web), false)
})
