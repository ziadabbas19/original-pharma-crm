/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationVisibility } from './locationVisibility'
import type { MockLocationPolicy } from './mockLocationPolicy'

export interface LocationTrustSettingsDto {
  maxSpeedKmh: number
  maxDistanceFromDoctorMeters: number
  accuracyAllowanceMeters: number
  lowTrustAccuracyMeters: number
  perfectAccuracyMeters: number
  repeatedAccuracyRun: number
  mockPolicy: MockLocationPolicy
  deviceSignalsRetentionDays: number
  isDefault: boolean
  /** @nullable */
  updatedAt: string | null
  /** @nullable */
  updatedByName: string | null
  driftFromClinicMeters: number
  driftFromVisitsMeters: number
  visibility: LocationVisibility
  visitWindowBufferMinutes: number
}
