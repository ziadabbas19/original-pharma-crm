/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { TrackingFlagStatus } from './trackingFlagStatus'
import type { TrackingFlagType } from './trackingFlagType'

export interface IntegrityEventDto {
  id: string
  userId: string
  userName: string
  type: TrackingFlagType
  status: TrackingFlagStatus
  score: number
  signals: string[]
  /** @nullable */
  details: string | null
  createdAt: string
  /** @nullable */
  lastSeenAt: string | null
  occurrences: number
  /** @nullable */
  locationPointId: number | null
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  /** @nullable */
  pointRecordedAt: string | null
  /** @nullable */
  visitId: string | null
  /** @nullable */
  customerName: string | null
  /** @nullable */
  customerNameAr: string | null
  /** @nullable */
  reviewNote: string | null
  /** @nullable */
  reviewedAt: string | null
  /** @nullable */
  reviewedByName: string | null
  locationHidden?: boolean
}
