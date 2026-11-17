/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface LocationPointDto {
  lat: number
  lng: number
  accuracy: number
  timestamp: string
  /** @nullable */
  speed?: number | null
  /** @nullable */
  heading?: number | null
  /** @nullable */
  batteryLevel?: number | null
  isMock?: boolean
  /** @nullable */
  isMoving?: boolean | null
  /** @nullable */
  uuid?: string | null
}
