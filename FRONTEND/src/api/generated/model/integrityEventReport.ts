/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DeviceSignalsDto } from './deviceSignalsDto'

export interface IntegrityEventReport {
  deviceId: string
  detectedAt: string
  /** @nullable */
  lat?: number | null
  /** @nullable */
  lng?: number | null
  /** @nullable */
  accuracy?: number | null
  deviceSignals?: null | DeviceSignalsDto
}
