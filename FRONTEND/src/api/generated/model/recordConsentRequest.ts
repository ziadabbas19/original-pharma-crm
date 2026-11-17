/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DevicePlatform } from './devicePlatform'

export interface RecordConsentRequest {
  consentVersion: string
  deviceId: string
  platform: DevicePlatform
  locale: string
  /** @nullable */
  clientAcceptedAt?: string | null
}
