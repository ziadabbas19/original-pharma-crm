/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DeviceSignalsDto } from './deviceSignalsDto'
import type { LocationTrustStatus } from './locationTrustStatus'

export interface IntegrityPointDto {
  id: number
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  accuracy: number
  recordedAt: string
  /** @nullable */
  deviceTime: string | null
  isMock: boolean
  trustStatus: LocationTrustStatus
  /** @nullable */
  trustReason: string | null
  codes: string[]
  /** @nullable */
  altitude: number | null
  /** @nullable */
  activityType: string | null
  deviceSignals: null | DeviceSignalsDto
  locationHidden?: boolean
}
