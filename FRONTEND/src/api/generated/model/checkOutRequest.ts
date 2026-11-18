/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CheckOutRequest {
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  /** @nullable */
  accuracy: number | null
  timestamp: string
  isMock?: boolean
  /** @nullable */
  notes?: string | null
  /** @nullable */
  clientRequestId?: string | null
}
