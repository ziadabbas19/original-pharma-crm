/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { TrackingFlagStatus } from './trackingFlagStatus'
import type { TrackingFlagType } from './trackingFlagType'

export type LocationIntegrityListEventsParams = {
  from?: string
  to?: string
  userId?: string
  reason?: string
  status?: TrackingFlagStatus
  type?: TrackingFlagType
}
