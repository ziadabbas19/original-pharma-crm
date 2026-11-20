/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { MockLocationPolicy } from './mockLocationPolicy'

export interface UpdateLocationTrustSettingsRequest {
  maxSpeedKmh: number
  maxDistanceFromDoctorMeters: number
  accuracyAllowanceMeters: number
  lowTrustAccuracyMeters: number
  perfectAccuracyMeters: number
  repeatedAccuracyRun: number
  mockPolicy: MockLocationPolicy
  deviceSignalsRetentionDays: number
}
