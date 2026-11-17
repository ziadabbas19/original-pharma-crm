/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationSource } from './locationSource'

export interface StartShiftRequest {
  deviceId: string
  source: LocationSource
  /** @nullable */
  lat?: number | null
  /** @nullable */
  lng?: number | null
  /** @nullable */
  accuracy?: number | null
  /** @nullable */
  integrityToken?: string | null
  /** @nullable */
  integrityNonce?: string | null
}
