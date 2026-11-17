/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CheckOutRequest {
  lat: number
  lng: number
  accuracy: number
  timestamp: string
  isMock?: boolean
  /** @nullable */
  notes?: string | null
}
