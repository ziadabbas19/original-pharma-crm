/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationPointDto } from './locationPointDto'
import type { LocationSource } from './locationSource'

export interface LocationBatchRequest {
  deviceId: string
  source: LocationSource
  points: LocationPointDto[]
  /** @nullable */
  sentAt?: string | null
}
