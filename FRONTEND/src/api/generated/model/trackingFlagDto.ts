/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { TrackingFlagStatus } from './trackingFlagStatus'
import type { TrackingFlagType } from './trackingFlagType'

export interface TrackingFlagDto {
  id: string
  userId: string
  /** @nullable */
  userName: string | null
  type: TrackingFlagType
  status: TrackingFlagStatus
  score: number
  signals: string[]
  /** @nullable */
  details: string | null
  createdAt: string
}
