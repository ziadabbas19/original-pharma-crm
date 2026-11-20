import type { DeviceSignals } from './types'

/**
 * Device signals helpers shared by the platform implementations. No imports beyond types, so the
 * unit tests can load this file directly.
 */

const MAX_LIST = 20

/** Nothing known: what the web and a device without the native plugin report. */
export function unknownSignals(platform: DeviceSignals['platform'], now = new Date()): DeviceSignals {
  return {
    platform,
    developerOptionsEnabled: null,
    mockLocationAppSelected: null,
    spoofingApps: [],
    autoTimeEnabled: null,
    autoTimeZoneEnabled: null,
    emulator: null,
    emulatorSignals: [],
    rooted: null,
    rootSignals: [],
    collectedAt: now.toISOString(),
  }
}

const flag = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128)
        .slice(0, MAX_LIST)
    : []

/** Accepts whatever the native side returned and keeps only well-formed values. */
export function normalizeSignals(
  raw: Partial<Record<keyof DeviceSignals, unknown>> | null | undefined,
  platform: DeviceSignals['platform'],
  now = new Date(),
): DeviceSignals {
  if (!raw) return unknownSignals(platform, now)
  const collectedAt =
    typeof raw.collectedAt === 'string' && !Number.isNaN(Date.parse(raw.collectedAt))
      ? raw.collectedAt
      : now.toISOString()
  return {
    platform,
    developerOptionsEnabled: flag(raw.developerOptionsEnabled),
    mockLocationAppSelected: flag(raw.mockLocationAppSelected),
    spoofingApps: list(raw.spoofingApps),
    autoTimeEnabled: flag(raw.autoTimeEnabled),
    autoTimeZoneEnabled: flag(raw.autoTimeZoneEnabled),
    emulator: flag(raw.emulator),
    emulatorSignals: list(raw.emulatorSignals),
    rooted: flag(raw.rooted),
    rootSignals: list(raw.rootSignals),
    collectedAt,
  }
}

/** True when the device setup alone already makes its locations doubtful. */
export function signalsLookSpoofed(signals: DeviceSignals | null | undefined): boolean {
  return signals?.mockLocationAppSelected === true || signals?.emulator === true
}
