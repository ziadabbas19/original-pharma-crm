/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationSource } from './locationSource'

export interface LivePositionDto {
  userId: string
  lat: number
  lng: number
  accuracy: number
  recordedAt: string
  receivedAt: string
  /** @nullable */
  speed: number | null
  /** @nullable */
  batteryLevel: number | null
  isMock: boolean
  anomalyScore: number
  source: LocationSource
  /** @nullable */
  shiftId: string | null
}
