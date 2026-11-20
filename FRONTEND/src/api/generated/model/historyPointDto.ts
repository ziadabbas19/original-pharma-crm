/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationTrustStatus } from './locationTrustStatus'

export interface HistoryPointDto {
  lat: number
  lng: number
  accuracy: number
  recordedAt: string
  /** @nullable */
  speed: number | null
  isMock: boolean
  anomalyScore: number
  id?: number
  trustStatus?: LocationTrustStatus
  /** @nullable */
  trustReason?: string | null
  excluded?: boolean
}
