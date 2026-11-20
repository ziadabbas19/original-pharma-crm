/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ClinicLocationSource } from './clinicLocationSource'
import type { DoctorRepDto } from './doctorRepDto'

export interface DoctorDto {
  id: string
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  townId: string | null
  /** @nullable */
  townName: string | null
  /** @nullable */
  townNameAr: string | null
  /** @nullable */
  areaId: string | null
  /** @nullable */
  specialtyId: string | null
  /** @nullable */
  specialtyNameAr: string | null
  /** @nullable */
  specialtyNameEn: string | null
  /** @nullable */
  phone: string | null
  /** @nullable */
  notes: string | null
  isActive: boolean
  reps: DoctorRepDto[]
  onMyList: boolean
  outsideMyArea: boolean
  /** @nullable */
  archivedAt?: string | null
  /** @nullable */
  lat?: number | null
  /** @nullable */
  lng?: number | null
  geofenceRadiusMeters?: number
  locationSource?: null | ClinicLocationSource
  /** @nullable */
  locationCapturedAt?: string | null
  /** @nullable */
  locationCapturedByName?: string | null
  /** @nullable */
  locationAccuracyMeters?: number | null
  /** @nullable */
  locationVisitId?: string | null
}
