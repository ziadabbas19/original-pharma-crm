/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DoctorLocationInput } from './doctorLocationInput'

export interface UpdateDoctorRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  townId: string
  specialtyId: string
  /** @nullable */
  phone?: string | null
  /** @nullable */
  notes?: string | null
  isActive?: boolean
  location?: null | DoctorLocationInput
}
