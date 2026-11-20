/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface DeviceSignalsDto {
  /** @nullable */
  platform?: string | null
  /** @nullable */
  developerOptionsEnabled?: boolean | null
  /** @nullable */
  mockLocationAppSelected?: boolean | null
  /** @nullable */
  spoofingApps?: string[] | null
  /** @nullable */
  autoTimeEnabled?: boolean | null
  /** @nullable */
  autoTimeZoneEnabled?: boolean | null
  /** @nullable */
  emulator?: boolean | null
  /** @nullable */
  emulatorSignals?: string[] | null
  /** @nullable */
  rooted?: boolean | null
  /** @nullable */
  rootSignals?: string[] | null
  /** @nullable */
  locationFromAccessory?: boolean | null
  /** @nullable */
  collectedAt?: string | null
}
