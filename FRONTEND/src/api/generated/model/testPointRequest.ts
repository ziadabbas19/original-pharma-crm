/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationPointDto } from './locationPointDto'
import type { LocationSource } from './locationSource'

export interface TestPointRequest {
  deviceId: string
  source: LocationSource
  point: LocationPointDto
  /** @nullable */
  sentAt?: string | null
}
