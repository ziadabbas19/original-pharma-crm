/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ClinicLocationSource } from './clinicLocationSource'
import type { DoctorVisitLocationDto } from './doctorVisitLocationDto'

export interface DoctorLocationHistoryDto {
  doctorId: string
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  geofenceRadiusMeters: number
  locationSource: null | ClinicLocationSource
  /** @nullable */
  locationCapturedAt: string | null
  /** @nullable */
  locationCapturedByName: string | null
  /** @nullable */
  locationAccuracyMeters: number | null
  /** @nullable */
  locationVisitId: string | null
  /** @nullable */
  medianLat: number | null
  /** @nullable */
  medianLng: number | null
  visits: DoctorVisitLocationDto[]
  capped: boolean
}
