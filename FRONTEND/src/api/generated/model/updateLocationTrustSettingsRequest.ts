/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationVisibility } from './locationVisibility'
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
  /** @nullable */
  driftFromClinicMeters?: number | null
  /** @nullable */
  driftFromVisitsMeters?: number | null
  visibility?: null | LocationVisibility
  /** @nullable */
  visitWindowBufferMinutes?: number | null
}
