/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CheckInRequest {
  customerId: string
  deviceId: string
  lat: number
  lng: number
  accuracy: number
  timestamp: string
  isMock?: boolean
  /** @nullable */
  qrPayload?: string | null
  /** @nullable */
  clientRequestId?: string | null
}
