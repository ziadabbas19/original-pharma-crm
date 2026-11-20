/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ClinicLocationOutcome } from './clinicLocationOutcome'

export interface VisitLocationDto {
  lat: number
  lng: number
  accuracy: number
  isMock: boolean
  signalCodes: string[]
  clinicLocationOutcome: ClinicLocationOutcome
  /** @nullable */
  clinicDistanceMeters: number | null
  /** @nullable */
  previousVisitDistanceMeters: number | null
  /** @nullable */
  sincePreviousVisitSeconds: number | null
  /** @nullable */
  medianDistanceMeters: number | null
  /** @nullable */
  nearestVisitDistanceMeters: number | null
  referenceVisitCount: number
  goodFix: boolean
  locationDrift: boolean
  driftSources: string[]
}
