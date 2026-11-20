/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface TrackingConfigDto {
  mode: string
  distanceFilterMeters: number
  uploadBatchSize: number
  uploadIntervalSeconds: number
  heartbeatIntervalSeconds: number
  /** @nullable */
  liveUntil: string | null
  consentVersion: string
  collectionMode?: string
}
